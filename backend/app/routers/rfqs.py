from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.rfq import RFQCreate, RFQUpdate, RFQResponse, RFQDetailResponse
from app.services.rfq_service import create_new_rfq, get_all_rfqs, get_rfq_detail_dict, update_upcoming_rfq, delete_rfq
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.sockets.server import broadcast_rfq_update, broadcast_rfq_deleted

router = APIRouter(prefix="/rfqs", tags=["rfqs"])

@router.post("", response_model=RFQResponse)
def create_rfq(
    payload: RFQCreate,
    current_user: User = Depends(require_role("BUYER")),
    db: Session = Depends(get_db)
):
    return create_new_rfq(payload, current_user, db)

@router.get("", response_model=List[RFQResponse])
def list_rfqs(db: Session = Depends(get_db)):
    return get_all_rfqs(db)

@router.get("/{rfq_id}", response_model=RFQDetailResponse)
def get_rfq_detail(
    rfq_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_rfq_detail_dict(rfq_id, current_user, db)

@router.put("/{rfq_id}", response_model=RFQResponse)
async def update_rfq(
    rfq_id: int,
    payload: RFQUpdate,
    current_user: User = Depends(require_role("BUYER")),
    db: Session = Depends(get_db)
):
    updated = update_upcoming_rfq(rfq_id, payload, current_user, db)
    full_detail = get_rfq_detail_dict(rfq_id, current_user, db)
    await broadcast_rfq_update(rfq_id, full_detail)
    return updated

@router.delete("/{rfq_id}")
async def remove_rfq(
    rfq_id: int,
    current_user: User = Depends(require_role("BUYER")),
    db: Session = Depends(get_db)
):
    result = delete_rfq(rfq_id, current_user, db)
    await broadcast_rfq_deleted(rfq_id)
    return result
