from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.bid import QuoteBidResponse
from app.schemas.activity_log import ActivityLogResponse

class RFQCreate(BaseModel):
    reference_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    pickup_date: datetime
    bid_start_time: datetime
    bid_close_time: datetime
    forced_bid_close_time: datetime
    is_british_auction: bool = True
    trigger_window_minutes: int = 10
    extension_duration_minutes: int = 5
    extension_trigger: str = "ANY_BID"

class RFQUpdate(BaseModel):
    reference_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    pickup_date: Optional[datetime] = None
    bid_start_time: Optional[datetime] = None
    bid_close_time: Optional[datetime] = None
    forced_bid_close_time: Optional[datetime] = None
    trigger_window_minutes: Optional[int] = None
    extension_duration_minutes: Optional[int] = None
    extension_trigger: Optional[str] = None

class RFQResponse(BaseModel):
    id: int
    reference_id: str
    title: str
    description: Optional[str] = None
    pickup_date: datetime
    bid_start_time: datetime
    bid_close_time: datetime
    forced_bid_close_time: datetime
    is_british_auction: bool
    trigger_window_minutes: int
    extension_duration_minutes: int
    extension_trigger: str
    status: str
    created_by: int
    created_at: datetime
    current_lowest_bid: Optional[float] = None
    total_bids_count: int = 0

    class Config:
        from_attributes = True

class RFQDetailResponse(BaseModel):
    rfq: RFQResponse
    bids: List[QuoteBidResponse]
    logs: List[ActivityLogResponse]
    user_rank: Optional[str] = None
    user_lowest_bid: Optional[float] = None
    user_latest_quote: Optional[dict] = None
