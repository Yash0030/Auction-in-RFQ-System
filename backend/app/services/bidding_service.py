from typing import Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.rfq import RFQ
from app.models.bid import QuoteBid
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.schemas.bid import QuoteBidCreate
from app.services.auction_engine import refresh_rfq_status, calculate_supplier_ranks, evaluate_extension, get_now

def submit_quote_bid(rfq_id: int, payload: QuoteBidCreate, supplier: User, db: Session) -> Tuple[QuoteBid, bool, str]:
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    now = get_now(rfq.bid_close_time)
    current_status = refresh_rfq_status(rfq, db)
    
    if current_status != "ACTIVE":
        raise HTTPException(status_code=400, detail=f"Auction is {current_status}. Bids cannot be submitted.")
    
    if now < rfq.bid_start_time:
        raise HTTPException(status_code=400, detail="Auction has not started yet.")

    if now >= rfq.bid_close_time:
        raise HTTPException(status_code=400, detail="Auction is closed.")

    # compute total across freight, origin and destination components
    total_amount = round(payload.freight_charges + payload.origin_charges + payload.destination_charges, 2)
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than zero.")

    # ensure new bid beats the supplier's previous personal best
    existing_bids = db.query(QuoteBid).filter(
        QuoteBid.rfq_id == rfq.id,
        QuoteBid.supplier_id == supplier.id
    ).all()

    if existing_bids:
        lowest_existing = min(float(b.total_amount) for b in existing_bids)
        if total_amount >= lowest_existing:
            raise HTTPException(
                status_code=400,
                detail=f"Bid total ${total_amount} must be lower than your current best bid ${lowest_existing:.2f}"
            )

    prev_ranks, prev_l1 = calculate_supplier_ranks(rfq.id, db)

    new_bid = QuoteBid(
        rfq_id=rfq.id,
        supplier_id=supplier.id,
        carrier_name=payload.carrier_name,
        freight_charges=payload.freight_charges,
        origin_charges=payload.origin_charges,
        destination_charges=payload.destination_charges,
        total_amount=total_amount,
        transit_time=payload.transit_time,
        quote_validity=payload.quote_validity,
        submitted_at=now
    )
    db.add(new_bid)
    db.flush()

    new_ranks, new_l1 = calculate_supplier_ranks(rfq.id, db)

    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="BID_SUBMITTED",
        message=f"{supplier.name} submitted quote of ${total_amount:.2f} via {payload.carrier_name}",
        created_at=now
    ))

    # evaluate dynamic extension rules and commit transaction
    extended, extension_reason = evaluate_extension(
        rfq=rfq,
        supplier=supplier,
        prev_ranks=prev_ranks,
        new_ranks=new_ranks,
        prev_l1=prev_l1,
        new_l1=new_l1,
        now=now,
        db=db
    )

    db.commit()
    db.refresh(new_bid)
    db.refresh(rfq)

    return new_bid, extended, extension_reason
