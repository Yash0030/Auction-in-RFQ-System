from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.rfq import RFQ
from app.models.bid import QuoteBid
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.schemas.rfq import RFQCreate, RFQUpdate, RFQResponse
from app.services.auction_engine import refresh_rfq_status, calculate_supplier_ranks

# create tender and log initial creation event
def create_new_rfq(payload: RFQCreate, creator: User, db: Session) -> RFQ:
    if payload.forced_bid_close_time <= payload.bid_close_time:
        raise HTTPException(status_code=400, detail="Forced Bid Close Time must be strictly later than Bid Close Time")
    
    if payload.bid_close_time <= payload.bid_start_time:
        raise HTTPException(status_code=400, detail="Bid Close Time must be later than Bid Start Time")

    existing = db.query(RFQ).filter(RFQ.reference_id == payload.reference_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="RFQ Reference ID already exists")

    if payload.extension_trigger not in ["ANY_BID", "ANY_RANK_CHANGE", "L1_RANK_CHANGE"]:
        raise HTTPException(status_code=400, detail="Invalid extension trigger")

    resolved_title = payload.title if payload.title else payload.reference_id

    rfq = RFQ(
        reference_id=payload.reference_id,
        title=resolved_title,
        description=payload.description,
        pickup_date=payload.pickup_date,
        bid_start_time=payload.bid_start_time,
        bid_close_time=payload.bid_close_time,
        forced_bid_close_time=payload.forced_bid_close_time,
        is_british_auction=payload.is_british_auction,
        trigger_window_minutes=payload.trigger_window_minutes,
        extension_duration_minutes=payload.extension_duration_minutes,
        extension_trigger=payload.extension_trigger,
        created_by=creator.id
    )
    db.add(rfq)
    db.commit()
    db.refresh(rfq)

    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="RFQ_CREATED",
        message=f"RFQ {rfq.reference_id} created with British Auction ({rfq.extension_trigger}, X={rfq.trigger_window_minutes}m, Y={rfq.extension_duration_minutes}m)",
        created_at=datetime.now()
    ))
    db.commit()
    db.refresh(rfq)
    refresh_rfq_status(rfq, db)
    return rfq

def get_all_rfqs(db: Session) -> List[RFQResponse]:
    rfqs = db.query(RFQ).order_by(RFQ.created_at.desc()).all()
    result = []
    for r in rfqs:
        refresh_rfq_status(r, db)
        bids = db.query(QuoteBid).filter(QuoteBid.rfq_id == r.id).order_by(QuoteBid.total_amount.asc()).all()
        lowest = float(bids[0].total_amount) if bids else None
        
        result.append(RFQResponse(
            id=r.id,
            reference_id=r.reference_id,
            title=r.title,
            description=r.description,
            pickup_date=r.pickup_date,
            bid_start_time=r.bid_start_time,
            bid_close_time=r.bid_close_time,
            forced_bid_close_time=r.forced_bid_close_time,
            is_british_auction=r.is_british_auction,
            trigger_window_minutes=r.trigger_window_minutes,
            extension_duration_minutes=r.extension_duration_minutes,
            extension_trigger=r.extension_trigger,
            status=r.status,
            created_by=r.created_by,
            created_at=r.created_at,
            current_lowest_bid=lowest,
            total_bids_count=len(bids)
        ))
    return result

def get_rfq_detail_dict(rfq_id: int, current_user: Optional[User], db: Session) -> dict:
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    refresh_rfq_status(rfq, db)
    bids = db.query(QuoteBid).filter(QuoteBid.rfq_id == rfq.id).order_by(QuoteBid.total_amount.asc(), QuoteBid.submitted_at.asc()).all()
    ranks, _ = calculate_supplier_ranks(rfq.id, db)
    
    seen_suppliers = set()
    bid_items = []
    user_lowest = None
    user_rank_str = None
    user_latest_quote = None

    for b in bids:
        if current_user and b.supplier_id == current_user.id:
            if user_lowest is None or float(b.total_amount) < user_lowest:
                user_lowest = float(b.total_amount)
                rank_num = ranks.get(b.supplier_id)
                user_rank_str = f"L{rank_num}" if rank_num else "-"
                user_latest_quote = {
                    "carrier_name": b.carrier_name,
                    "freight_charges": float(b.freight_charges),
                    "origin_charges": float(b.origin_charges),
                    "destination_charges": float(b.destination_charges),
                    "transit_time": b.transit_time,
                    "quote_validity": b.quote_validity.isoformat() if hasattr(b.quote_validity, "isoformat") else str(b.quote_validity)
                }
        
        if b.supplier_id not in seen_suppliers:
            seen_suppliers.add(b.supplier_id)
            rank_num = ranks.get(b.supplier_id)
            rank_label = f"L{rank_num}" if rank_num else "-"
            bid_items.append({
                "id": b.id,
                "rfq_id": b.rfq_id,
                "supplier_id": b.supplier_id,
                "carrier_name": b.carrier_name,
                "freight_charges": float(b.freight_charges),
                "origin_charges": float(b.origin_charges),
                "destination_charges": float(b.destination_charges),
                "total_amount": float(b.total_amount),
                "transit_time": b.transit_time,
                "quote_validity": b.quote_validity.isoformat() if hasattr(b.quote_validity, "isoformat") else str(b.quote_validity),
                "submitted_at": b.submitted_at.isoformat() if hasattr(b.submitted_at, "isoformat") else str(b.submitted_at),
                "supplier_name": b.supplier.name,
                "rank": rank_label
            })

    def parse_rank_order(item):
        r = item.get("rank") or ""
        if r.startswith("L") and r[1:].isdigit():
            return int(r[1:])
        return 999999

    bid_items.sort(key=lambda x: (parse_rank_order(x), x["total_amount"], x["submitted_at"]))

    logs = db.query(ActivityLog).filter(ActivityLog.rfq_id == rfq.id).order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).all()
    lowest_bid_val = float(bids[0].total_amount) if bids else None

    return {
        "rfq": {
            "id": rfq.id,
            "reference_id": rfq.reference_id,
            "title": rfq.title,
            "description": rfq.description,
            "pickup_date": rfq.pickup_date.isoformat() if hasattr(rfq.pickup_date, "isoformat") else str(rfq.pickup_date),
            "bid_start_time": rfq.bid_start_time.isoformat() if hasattr(rfq.bid_start_time, "isoformat") else str(rfq.bid_start_time),
            "bid_close_time": rfq.bid_close_time.isoformat() if hasattr(rfq.bid_close_time, "isoformat") else str(rfq.bid_close_time),
            "forced_bid_close_time": rfq.forced_bid_close_time.isoformat() if hasattr(rfq.forced_bid_close_time, "isoformat") else str(rfq.forced_bid_close_time),
            "is_british_auction": rfq.is_british_auction,
            "trigger_window_minutes": rfq.trigger_window_minutes,
            "extension_duration_minutes": rfq.extension_duration_minutes,
            "extension_trigger": rfq.extension_trigger,
            "status": rfq.status,
            "created_by": rfq.created_by,
            "created_at": rfq.created_at.isoformat() if hasattr(rfq.created_at, "isoformat") else str(rfq.created_at),
            "current_lowest_bid": lowest_bid_val,
            "total_bids_count": len(bids)
        },
        "bids": bid_items,
        "logs": [
            {
                "id": l.id,
                "rfq_id": l.rfq_id,
                "event_type": l.event_type,
                "message": l.message,
                "created_at": l.created_at.isoformat() if hasattr(l.created_at, "isoformat") else str(l.created_at)
            }
            for l in logs
        ],
        "user_rank": user_rank_str,
        "user_lowest_bid": user_lowest,
        "user_latest_quote": user_latest_quote
    }

# allow tender updates only while auction is in DRAFT
def update_upcoming_rfq(rfq_id: int, payload: RFQUpdate, user: User, db: Session) -> RFQ:
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    if rfq.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer who created this RFQ can modify it.")

    refresh_rfq_status(rfq, db)
    if rfq.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only upcoming auctions can be modified.")

    new_start = payload.bid_start_time if payload.bid_start_time is not None else rfq.bid_start_time
    new_close = payload.bid_close_time if payload.bid_close_time is not None else rfq.bid_close_time
    new_forced = payload.forced_bid_close_time if payload.forced_bid_close_time is not None else rfq.forced_bid_close_time

    if new_close <= new_start:
        raise HTTPException(status_code=400, detail="Bid Close Time must be later than Bid Start Time")

    if new_forced <= new_close:
        raise HTTPException(status_code=400, detail="Forced Bid Close Time must be strictly later than Bid Close Time")

    if payload.reference_id and payload.reference_id != rfq.reference_id:
        existing = db.query(RFQ).filter(RFQ.reference_id == payload.reference_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="RFQ Reference ID already exists")
        rfq.reference_id = payload.reference_id
        if not payload.title:
            rfq.title = payload.reference_id

    if payload.title is not None:
        rfq.title = payload.title
    if payload.description is not None:
        rfq.description = payload.description
    if payload.pickup_date is not None:
        rfq.pickup_date = payload.pickup_date

    rfq.bid_start_time = new_start
    rfq.bid_close_time = new_close
    rfq.forced_bid_close_time = new_forced

    if payload.trigger_window_minutes is not None:
        if payload.trigger_window_minutes <= 0:
            raise HTTPException(status_code=400, detail="Trigger window must be positive")
        rfq.trigger_window_minutes = payload.trigger_window_minutes

    if payload.extension_duration_minutes is not None:
        if payload.extension_duration_minutes <= 0:
            raise HTTPException(status_code=400, detail="Extension duration must be positive")
        rfq.extension_duration_minutes = payload.extension_duration_minutes

    if payload.extension_trigger is not None:
        if payload.extension_trigger not in ["ANY_BID", "ANY_RANK_CHANGE", "L1_RANK_CHANGE"]:
            raise HTTPException(status_code=400, detail="Invalid extension trigger")
        rfq.extension_trigger = payload.extension_trigger

    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="RFQ_UPDATED",
        message=f"RFQ {rfq.reference_id} details were modified by buyer {user.name}",
        created_at=datetime.now()
    ))

    db.commit()
    db.refresh(rfq)
    refresh_rfq_status(rfq, db)
    return rfq

# delete tender and cascade delete associated quotes and logs
def delete_rfq(rfq_id: int, user: User, db: Session) -> dict:
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    if rfq.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer who created this RFQ can delete it.")

    refresh_rfq_status(rfq, db)
    if rfq.status == "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail="Active auctions cannot be deleted. You can delete an auction before it starts (upcoming) or after it ends (closed)."
        )

    ref_id = rfq.reference_id
    db.query(ActivityLog).filter(ActivityLog.rfq_id == rfq.id).delete()
    db.query(QuoteBid).filter(QuoteBid.rfq_id == rfq.id).delete()
    db.delete(rfq)
    db.commit()

    return {"success": True, "message": f"RFQ {ref_id} deleted successfully."}
