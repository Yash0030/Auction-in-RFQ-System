from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class RFQ(Base):
    __tablename__ = "rfqs"

    id = Column(Integer, primary_key=True, index=True)
    reference_id = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    pickup_date = Column(DateTime, nullable=False)
    bid_start_time = Column(DateTime, nullable=False)
    bid_close_time = Column(DateTime, nullable=False)
    forced_bid_close_time = Column(DateTime, nullable=False)
    is_british_auction = Column(Boolean, default=True)
    trigger_window_minutes = Column(Integer, default=10)
    extension_duration_minutes = Column(Integer, default=5)
    extension_trigger = Column(String(50), default="ANY_BID")
    status = Column(String(50), default="ACTIVE")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", back_populates="rfqs")
    bids = relationship("QuoteBid", back_populates="rfq", cascade="all, delete-orphan")
    logs = relationship("ActivityLog", back_populates="rfq", cascade="all, delete-orphan")

