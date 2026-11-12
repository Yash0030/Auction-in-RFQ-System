from datetime import datetime
from pydantic import BaseModel

class ActivityLogResponse(BaseModel):
    id: int
    rfq_id: int
    event_type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

