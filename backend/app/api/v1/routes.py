from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np

router = APIRouter()


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
    }
