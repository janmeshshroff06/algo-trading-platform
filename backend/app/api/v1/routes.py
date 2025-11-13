from fastapi import APIRouter

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
