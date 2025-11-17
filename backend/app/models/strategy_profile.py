from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String

from app.db.session import Base


class StrategyProfile(Base):
    __tablename__ = "strategy_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    name = Column(String, nullable=False, unique=True)
    symbol = Column(String, nullable=True)
    short_window = Column(Integer, nullable=False)
    long_window = Column(Integer, nullable=False)
    period = Column(String, nullable=False, default="3mo")
    interval = Column(String, nullable=False, default="1d")
    initial_capital = Column(Float, nullable=False, default=10_000)
    fee_rate = Column(Float, nullable=False, default=0.0005)
    order_index = Column(Integer, nullable=False, default=0)
