from fastapi import APIRouter, Depends, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, Base, engine
from app.models.backtest import Backtest
from app.models.strategy_profile import StrategyProfile

Base.metadata.create_all(bind=engine)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
    short_window: int = Query(10, ge=1),
    long_window: int = Query(20, ge=2),
    period: str = "3mo",
    interval: str = "1d",
    initial_capital: float = Query(10_000, gt=0),
    fee_rate: float = Query(0.0005, ge=0.0),  # e.g., 5 bps per trade
    db: Session = Depends(get_db),
):
    """
    Simple SMA crossover backtest that goes long when short SMA crosses above long SMA.
    """
    if short_window >= long_window:
        raise HTTPException(status_code=400, detail="short_window must be less than long_window.")

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
    history["short_sma"] = closes.rolling(window=short_window).mean()
    history["long_sma"] = closes.rolling(window=long_window).mean()
    history.dropna(subset=["short_sma", "long_sma"], inplace=True)

    if history.empty:
        raise HTTPException(status_code=400, detail="Not enough data for the requested windows.")

    history["position"] = np.where(history["short_sma"] > history["long_sma"], 1, 0)
    history["signal"] = history["position"].diff().fillna(0)

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

    record = Backtest(
        symbol=symbol.upper(),
        short_window=short_window,
        long_window=long_window,
        period=period,
        interval=interval,
        initial_capital=initial_capital,
        fee_rate=fee_rate,
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
        "symbol": symbol.upper(),
        "short_window": short_window,
        "long_window": long_window,
        "period": period,
        "interval": interval,
        "initial_capital": initial_capital,
        "fee_rate": fee_rate,
        "equity_curve": equity_curve,
        "trades": trades,
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
    item = StrategyProfile(
        name=profile["name"],
        symbol=profile.get("symbol", None),
        short_window=int(profile["short_window"]),
        long_window=int(profile["long_window"]),
        period=profile.get("period", "3mo"),
        interval=profile.get("interval", "1d"),
        initial_capital=float(profile.get("initial_capital", 10_000)),
        fee_rate=float(profile.get("fee_rate", 0.0005)),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "saved"}


@router.get("/strategies")
def list_strategies(db: Session = Depends(get_db)):
    items = db.query(StrategyProfile).order_by(StrategyProfile.created_at.desc()).all()
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
