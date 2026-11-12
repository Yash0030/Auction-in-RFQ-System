from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel

class QuoteBidCreate(BaseModel):
    carrier_name: str
    freight_charges: float
    origin_charges: float
    destination_charges: float
    transit_time: str
    quote_validity: date

class QuoteBidResponse(BaseModel):
    id: int
    rfq_id: int
    supplier_id: int
    carrier_name: str
    freight_charges: float
    origin_charges: float
    destination_charges: float
    total_amount: float
    transit_time: str
    quote_validity: date
    submitted_at: datetime
    supplier_name: Optional[str] = None
    rank: Optional[str] = None

    class Config:
        from_attributes = True
