from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Float, Integer, String

from app.db.session import Base


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

    sharpe = Column(Float, nullable=False)
    max_drawdown = Column(Float, nullable=False)
    total_return = Column(Float, nullable=False)
    win_rate = Column(Float, nullable=False)
    num_trades = Column(Integer, nullable=False)
