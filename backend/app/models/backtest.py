from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.db.session import Base

JSONType = JSONB().with_variant(Text, "sqlite")


class Backtest(Base):
    __tablename__ = "backtests"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    symbol = Column(String, index=True, nullable=False)
    short_window = Column(Integer, nullable=False)
    long_window = Column(Integer, nullable=False)
    period = Column(String, nullable=False)
    interval = Column(String, nullable=False)

    initial_capital = Column(Float, nullable=False)
    fee_rate = Column(Float, nullable=False)

    strategy_type = Column(String, nullable=False, default="sma")
    strategy_params = Column(JSONType, nullable=True)

    sharpe = Column(Float, nullable=False)
    max_drawdown = Column(Float, nullable=False)
    total_return = Column(Float, nullable=False)
    win_rate = Column(Float, nullable=False)
    num_trades = Column(Integer, nullable=False)
