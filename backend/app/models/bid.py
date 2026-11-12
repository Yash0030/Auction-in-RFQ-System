from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class QuoteBid(Base):
    __tablename__ = "quotes_bids"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    carrier_name = Column(String(255), nullable=False)
    freight_charges = Column(Numeric(12, 2), nullable=False)
    origin_charges = Column(Numeric(12, 2), nullable=False)
    destination_charges = Column(Numeric(12, 2), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    transit_time = Column(String(100), nullable=False)
    quote_validity = Column(Date, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    rfq = relationship("RFQ", back_populates="bids")
    supplier = relationship("User", back_populates="bids")

