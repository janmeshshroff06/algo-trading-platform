import json

from fastapi import APIRouter, Depends, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, Base, engine
from app.models.backtest import Backtest
from app.models.strategy_profile import StrategyProfile

Base.metadata.create_all(bind=engine)

# lightweight guard to add order_index when migrating from earlier schema
with engine.begin() as conn:
    if engine.dialect.name == "postgresql":
        conn.execute(
            text(
                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_name='strategy_profiles' AND column_name='order_index') THEN "
                "ALTER TABLE strategy_profiles ADD COLUMN order_index INTEGER DEFAULT 0; "
                "END IF; "
                "IF NOT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_name='backtests' AND column_name='strategy_type') THEN "
                "ALTER TABLE backtests ADD COLUMN strategy_type TEXT DEFAULT 'sma'; "
                "END IF; "
                "IF NOT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_name='backtests' AND column_name='strategy_params') THEN "
                "ALTER TABLE backtests ADD COLUMN strategy_params JSONB; "
                "END IF; "
                "END $$;"
            )
        )
    else:
        # SQLite: attempt to add column; ignore if it exists
        try:
            conn.execute(text("ALTER TABLE strategy_profiles ADD COLUMN order_index INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE backtests ADD COLUMN strategy_type TEXT DEFAULT 'sma'"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE backtests ADD COLUMN strategy_params TEXT"))
        except Exception:
            pass

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _deserialize_strategy_params(raw):
    if engine.dialect.name == "sqlite" and isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw or {}


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/market/{symbol}/ohlcv")
async def get_ohlcv(symbol: str, start: str | None = None, end: str | None = None, interval: str = "1d"):
    # TODO: hook up to TimescaleDB / data store
    return {
        "symbol": symbol,
        "interval": interval,
        "start": start,
        "end": end,
        "data": [],
    }


@router.get("/demo/prices")
async def demo_prices():
    return {
        "symbol": "DEMO",
        "prices": [100, 101, 102, 99, 105],
    }


@router.get("/prices/{symbol}")
async def get_prices(symbol: str, period: str = "1mo", interval: str = "1d"):
    """
    Fetch historical OHLCV data for a symbol via Yahoo Finance.
    """
    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period=period, interval=interval)
    except Exception as exc:  # pragma: no cover - simple error passthrough
        raise HTTPException(status_code=500, detail=f"Error fetching data: {exc}") from exc

    if history.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data returned for symbol {symbol}. Check the ticker or parameters.",
        )

    history = history.reset_index()
    ts_col = "Date" if "Date" in history.columns else "Datetime"

    data = [
        {
            "timestamp": row[ts_col].isoformat(),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]),
        }
        for _, row in history.iterrows()
    ]

    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "period": period,
        "data": data,
    }


@router.get("/backtest/sma")
async def sma_crossover_backtest(
    symbol: str,
    strategy_type: str = Query("sma"),
    short_window: int = Query(10, ge=1),
    long_window: int = Query(20, ge=2),
    period: str = "3mo",
    interval: str = "1d",
    initial_capital: float = Query(10_000, gt=0),
    fee_rate: float = Query(0.0005, ge=0.0),  # e.g., 5 bps per trade
    rsi_window: int = Query(14, ge=1),
    rsi_overbought: float = Query(70, ge=0),
    rsi_oversold: float = Query(30, ge=0),
    macd_fast: int = Query(12, ge=1),
    macd_slow: int = Query(26, ge=2),
    macd_signal: int = Query(9, ge=1),
    ema_fast: int = Query(10, ge=1),
    ema_slow: int = Query(20, ge=2),
    db: Session = Depends(get_db),
):
    """
    Multi-strategy backtest engine.
    strategy_type: sma | ema | rsi | macd | buyhold
    """
    symbol_upper = symbol.upper()
    strategy_type = strategy_type.lower()

    if strategy_type in ["sma", "ema"] and short_window >= long_window and strategy_type == "sma":
        raise HTTPException(status_code=400, detail="short_window must be less than long_window for SMA.")
    if strategy_type == "ema" and ema_fast >= ema_slow:
        raise HTTPException(status_code=400, detail="ema_fast must be less than ema_slow.")
    if strategy_type == "macd" and macd_fast >= macd_slow:
        raise HTTPException(status_code=400, detail="macd_fast must be less than macd_slow.")

    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period=period, interval=interval)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Error fetching data: {exc}") from exc

    if history.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data returned for symbol {symbol}. Check the ticker or parameters.",
        )

    history = history.reset_index()
    ts_col = "Date" if "Date" in history.columns else "Datetime"
    closes = history["Close"].copy()

    # signals and position determination
    position = pd.Series(0, index=history.index)

    if strategy_type == "sma":
        history["short_sma"] = closes.rolling(window=short_window).mean()
        history["long_sma"] = closes.rolling(window=long_window).mean()
        history.dropna(subset=["short_sma", "long_sma"], inplace=True)
        position = (history["short_sma"] > history["long_sma"]).astype(int)
    elif strategy_type == "ema":
        history["ema_fast"] = closes.ewm(span=ema_fast, adjust=False).mean()
        history["ema_slow"] = closes.ewm(span=ema_slow, adjust=False).mean()
        history.dropna(subset=["ema_fast", "ema_slow"], inplace=True)
        position = (history["ema_fast"] > history["ema_slow"]).astype(int)
    elif strategy_type == "rsi":
        delta = closes.diff()
        up = delta.clip(lower=0)
        down = -1 * delta.clip(upper=0)
        roll_up = up.rolling(rsi_window).mean()
        roll_down = down.rolling(rsi_window).mean()
        rs = roll_up / roll_down.replace(0, np.nan)
        history["rsi"] = 100 - (100 / (1 + rs))
        history.dropna(subset=["rsi"], inplace=True)
        position = (history["rsi"] < rsi_oversold).astype(int)
        # exit when overbought: set to 0 when rsi > overbought
        position = position.where(history["rsi"] <= rsi_overbought, 0)
    elif strategy_type == "macd":
        ema_fast_series = closes.ewm(span=macd_fast, adjust=False).mean()
        ema_slow_series = closes.ewm(span=macd_slow, adjust=False).mean()
        macd_line = ema_fast_series - ema_slow_series
        signal_line = macd_line.ewm(span=macd_signal, adjust=False).mean()
        history["macd"] = macd_line
        history["signal"] = signal_line
        history.dropna(subset=["macd", "signal"], inplace=True)
        position = (history["macd"] > history["signal"]).astype(int)
    elif strategy_type == "buyhold":
        position = pd.Series(1, index=history.index)
    else:
        raise HTTPException(status_code=400, detail="Unsupported strategy_type.")

    history["position"] = position
    history["signal"] = history["position"].diff().fillna(0)

    ohlc: list[dict[str, float | int]] = []
    for _, row in history.iterrows():
        ohlc.append(
            {
                "time": int(pd.Timestamp(row[ts_col]).timestamp()),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
            }
        )

    cash = float(initial_capital)
    shares = 0
    entry_price = None
    entry_shares = 0
    completed_trades = 0
    wins = 0
    equity_curve: list[dict[str, float | str]] = []
    trades: list[dict[str, float | str]] = []

    for _, row in history.iterrows():
        price = float(row["Close"])
        timestamp = row[ts_col].isoformat()
        signal = row["signal"]

        if signal == 1 and shares == 0:
            shares = int(cash // price)
            if shares > 0:
                cost = shares * price
                commission = cost * fee_rate
                cash -= cost + commission
                entry_price = price
                entry_shares = shares
                trades.append(
                    {
                        "timestamp": timestamp,
                        "side": "BUY",
                        "price": price,
                        "shares": shares,
                        "equity_after_trade": round(cash + shares * price, 2),
                    }
                )
        elif signal == -1 and shares > 0:
            proceeds = shares * price
            commission = proceeds * fee_rate
            cash += proceeds - commission
            trades.append(
                {
                    "timestamp": timestamp,
                    "side": "SELL",
                    "price": price,
                    "shares": shares,
                    "equity_after_trade": round(cash, 2),
                }
            )
            if entry_price is not None and entry_shares:
                completed_trades += 1
                if price > entry_price:
                    wins += 1
            shares = 0
            entry_price = None
            entry_shares = 0

        equity = cash + shares * price
        equity_curve.append({"timestamp": timestamp, "equity": round(equity, 2)})

    # Close any open position at end for buy/hold; keep as is for others by default
    if shares > 0:
        price = float(history.iloc[-1]["Close"])
        proceeds = shares * price
        commission = proceeds * fee_rate
        cash += proceeds - commission
        trades.append(
            {
                "timestamp": history.iloc[-1][ts_col].isoformat(),
                "side": "SELL",
                "price": price,
                "shares": shares,
                "equity_after_trade": round(cash, 2),
            }
        )
        if entry_price is not None and entry_shares:
            completed_trades += 1
            if price > entry_price:
                wins += 1
        shares = 0
        equity_curve[-1]["equity"] = round(cash, 2)

    equity_df = pd.DataFrame(equity_curve).set_index("timestamp")
    returns = equity_df["equity"].pct_change().dropna()

    if not returns.empty and returns.std() > 0:
        sharpe = (returns.mean() / returns.std()) * np.sqrt(252)
    else:
        sharpe = 0.0

    rolling_max = equity_df["equity"].cummax()
    drawdown = (equity_df["equity"] - rolling_max) / rolling_max
    max_drawdown = float(drawdown.min()) if not drawdown.empty else 0.0

    win_rate = (wins / completed_trades) if completed_trades > 0 else 0.0
    total_return = (equity_curve[-1]["equity"] / initial_capital) - 1 if equity_curve else 0.0
    num_trades = completed_trades

    strategy_params = {
        "short_window": short_window,
        "long_window": long_window,
        "rsi_window": rsi_window,
        "rsi_overbought": rsi_overbought,
        "rsi_oversold": rsi_oversold,
        "macd_fast": macd_fast,
        "macd_slow": macd_slow,
        "macd_signal": macd_signal,
        "ema_fast": ema_fast,
        "ema_slow": ema_slow,
    }

    # SQLite JSON fallback: store as string
    strategy_params_for_db = (
        json.dumps(strategy_params) if engine.dialect.name == "sqlite" else strategy_params
    )

    record = Backtest(
        symbol=symbol_upper,
        short_window=short_window,
        long_window=long_window,
        period=period,
        interval=interval,
        initial_capital=initial_capital,
        fee_rate=fee_rate,
        strategy_type=strategy_type,
        strategy_params=strategy_params_for_db,
        sharpe=round(float(sharpe), 3),
        max_drawdown=round(max_drawdown, 4),
        total_return=round(total_return, 4),
        win_rate=round(win_rate, 3),
        num_trades=num_trades,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "symbol": symbol_upper,
        "short_window": short_window,
        "long_window": long_window,
        "period": period,
        "interval": interval,
        "initial_capital": initial_capital,
        "fee_rate": fee_rate,
        "strategy_type": strategy_type,
        "strategy_params": strategy_params,
        "equity_curve": equity_curve,
        "trades": trades,
        "ohlc": ohlc,
        "metrics": {
            "sharpe": round(float(sharpe), 3),
            "max_drawdown": round(max_drawdown, 4),
            "win_rate": round(win_rate, 3),
            "total_return": round(total_return, 4),
            "num_trades": num_trades,
        },
        "id": record.id,
        "created_at": record.created_at.isoformat(),
    }


@router.get("/backtests")
def list_backtests(
    symbol: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Backtest)
    if symbol:
        query = query.filter(Backtest.symbol == symbol.upper())
    results = query.order_by(Backtest.created_at.desc()).limit(limit).all()
    return [
        {
            "id": bt.id,
            "created_at": bt.created_at.isoformat(),
            "symbol": bt.symbol,
            "strategy_type": getattr(bt, "strategy_type", "sma"),
            "strategy_params": _deserialize_strategy_params(getattr(bt, "strategy_params", {})),
            "short_window": bt.short_window,
            "long_window": bt.long_window,
            "period": bt.period,
            "interval": bt.interval,
            "initial_capital": bt.initial_capital,
            "fee_rate": bt.fee_rate,
            "metrics": {
                "sharpe": bt.sharpe,
                "max_drawdown": bt.max_drawdown,
                "total_return": bt.total_return,
                "win_rate": bt.win_rate,
                "num_trades": bt.num_trades,
            },
        }
        for bt in results
    ]


@router.get("/backtests/{backtest_id}")
def get_backtest(backtest_id: int, db: Session = Depends(get_db)):
    bt = db.query(Backtest).filter(Backtest.id == backtest_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return {
        "id": bt.id,
        "created_at": bt.created_at.isoformat(),
        "symbol": bt.symbol,
        "strategy_type": getattr(bt, "strategy_type", "sma"),
        "strategy_params": _deserialize_strategy_params(getattr(bt, "strategy_params", {})),
        "short_window": bt.short_window,
        "long_window": bt.long_window,
        "period": bt.period,
        "interval": bt.interval,
        "initial_capital": bt.initial_capital,
        "fee_rate": bt.fee_rate,
        "metrics": {
            "sharpe": bt.sharpe,
            "max_drawdown": bt.max_drawdown,
            "total_return": bt.total_return,
            "win_rate": bt.win_rate,
            "num_trades": bt.num_trades,
        },
    }


@router.post("/strategies")
def create_strategy(profile: dict, db: Session = Depends(get_db)):
    required = ["name", "short_window", "long_window", "period", "interval", "initial_capital", "fee_rate"]
    for key in required:
        if key not in profile:
            raise HTTPException(status_code=400, detail=f"Missing required field: {key}")

    if db.query(StrategyProfile).filter(StrategyProfile.name == profile["name"]).first():
        raise HTTPException(status_code=400, detail="A profile with this name already exists.")

    max_order = db.query(func.max(StrategyProfile.order_index)).scalar() or 0

    item = StrategyProfile(
        name=profile["name"],
        symbol=profile.get("symbol", None),
        short_window=int(profile["short_window"]),
        long_window=int(profile["long_window"]),
        period=profile.get("period", "3mo"),
        interval=profile.get("interval", "1d"),
        initial_capital=float(profile.get("initial_capital", 10_000)),
        fee_rate=float(profile.get("fee_rate", 0.0005)),
        order_index=max_order + 1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "saved"}


@router.get("/strategies")
def list_strategies(db: Session = Depends(get_db)):
    items = db.query(StrategyProfile).order_by(StrategyProfile.order_index.asc(), StrategyProfile.id.asc()).all()
    return [
        {
            "id": s.id,
            "created_at": s.created_at.isoformat(),
            "name": s.name,
            "symbol": s.symbol,
            "short_window": s.short_window,
            "long_window": s.long_window,
            "period": s.period,
            "interval": s.interval,
            "initial_capital": s.initial_capital,
            "fee_rate": s.fee_rate,
        }
        for s in items
    ]


@router.get("/strategies/{strategy_id}")
def get_strategy(strategy_id: int, db: Session = Depends(get_db)):
    s = db.query(StrategyProfile).filter(StrategyProfile.id == strategy_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {
        "id": s.id,
        "created_at": s.created_at.isoformat(),
        "name": s.name,
        "symbol": s.symbol,
        "short_window": s.short_window,
        "long_window": s.long_window,
        "period": s.period,
        "interval": s.interval,
        "initial_capital": s.initial_capital,
        "fee_rate": s.fee_rate,
    }


@router.delete("/strategies/{strategy_id}")
def delete_strategy(strategy_id: int, db: Session = Depends(get_db)):
    profile = db.query(StrategyProfile).filter(StrategyProfile.id == strategy_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
    return {"status": "deleted"}


@router.patch("/strategies/{strategy_id}/rename")
def rename_strategy(strategy_id: int, data: dict, db: Session = Depends(get_db)):
    new_name = data.get("name")
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if db.query(StrategyProfile).filter(StrategyProfile.name == new_name).first():
        raise HTTPException(status_code=400, detail="A profile with this name already exists.")
    profile = db.query(StrategyProfile).filter(StrategyProfile.id == strategy_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.name = new_name
    db.commit()
    db.refresh(profile)
    return {"status": "renamed", "name": profile.name}


@router.post("/strategies/{strategy_id}/duplicate")
def duplicate_strategy(strategy_id: int, db: Session = Depends(get_db)):
    original = db.query(StrategyProfile).filter(StrategyProfile.id == strategy_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Profile not found")
    max_order = db.query(func.max(StrategyProfile.order_index)).scalar() or 0
    base_name = f"{original.name} (Copy)"
    new_name = base_name
    suffix = 1
    while db.query(StrategyProfile).filter(StrategyProfile.name == new_name).first():
        suffix += 1
        new_name = f"{base_name} {suffix}"
    copy = StrategyProfile(
        name=new_name,
        symbol=original.symbol,
        short_window=original.short_window,
        long_window=original.long_window,
        period=original.period,
        interval=original.interval,
        initial_capital=original.initial_capital,
        fee_rate=original.fee_rate,
        order_index=max_order + 1,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return {"id": copy.id, "status": "duplicated", "name": copy.name}


@router.patch("/strategies/{strategy_id}/move")
def move_strategy(strategy_id: int, data: dict, db: Session = Depends(get_db)):
    direction = data.get("direction")
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Invalid direction")
    items = db.query(StrategyProfile).order_by(StrategyProfile.order_index.asc(), StrategyProfile.id.asc()).all()
    index = next((i for i, p in enumerate(items) if p.id == strategy_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if direction == "up" and index == 0:
        return {"status": "nochange"}
    if direction == "down" and index == len(items) - 1:
        return {"status": "nochange"}
    swap_index = index - 1 if direction == "up" else index + 1
    items[index].order_index, items[swap_index].order_index = (
        items[swap_index].order_index,
        items[index].order_index,
    )
    db.commit()
    return {"status": "reordered"}
