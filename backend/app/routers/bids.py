from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.bid import QuoteBidCreate
from app.services.bidding_service import submit_quote_bid
from app.services.rfq_service import get_rfq_detail_dict
from app.core.deps import require_role
from app.models.user import User
from app.sockets.server import broadcast_rfq_update

router = APIRouter(prefix="/rfqs", tags=["bids"])

@router.post("/{rfq_id}/bids")
async def place_bid(
    rfq_id: int,
    payload: QuoteBidCreate,
    current_user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db)
):
    new_bid, extended, reason = submit_quote_bid(rfq_id, payload, current_user, db)
    full_detail = get_rfq_detail_dict(rfq_id, current_user, db)
    await broadcast_rfq_update(rfq_id, full_detail)
    return {
        "success": True,
        "bid_id": new_bid.id,
        "total_amount": float(new_bid.total_amount),
        "extended": extended,
        "extension_reason": reason
    }
