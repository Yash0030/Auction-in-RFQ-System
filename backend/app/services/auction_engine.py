from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.rfq import RFQ
from app.models.bid import QuoteBid
from app.models.activity_log import ActivityLog
from app.models.user import User

def get_now(ref: Optional[datetime] = None) -> datetime:
    if ref and ref.tzinfo is not None:
        return datetime.now(timezone.utc)
    return datetime.now()

# auto-update rfq status based on current timestamp
def refresh_rfq_status(rfq: RFQ, db: Session) -> str:
    now = get_now(rfq.bid_close_time)
    original_status = rfq.status
    if now >= rfq.forced_bid_close_time:
        rfq.status = "FORCE_CLOSED"
    elif now >= rfq.bid_close_time:
        rfq.status = "CLOSED"
    elif now >= rfq.bid_start_time:
        rfq.status = "ACTIVE"
    else:
        rfq.status = "DRAFT"
    
    if rfq.status != original_status:
        db.add(ActivityLog(
            rfq_id=rfq.id,
            event_type="STATUS_CHANGE",
            message=f"Auction status changed from {original_status} to {rfq.status}",
            created_at=now
        ))
        db.commit()
    return rfq.status

# calculate supplier leaderboard: lowest price first, tie-break by earlier bid
def calculate_supplier_ranks(rfq_id: int, db: Session) -> Tuple[Dict[int, int], Optional[int]]:
    bids = db.query(QuoteBid).filter(QuoteBid.rfq_id == rfq_id).order_by(QuoteBid.total_amount.asc(), QuoteBid.submitted_at.asc()).all()
    supplier_bests = {}
    for b in bids:
        sid = b.supplier_id
        amt = float(b.total_amount)
        if sid not in supplier_bests:
            supplier_bests[sid] = (amt, b.submitted_at)
        else:
            prev_amt, prev_time = supplier_bests[sid]
            if amt < prev_amt or (amt == prev_amt and b.submitted_at < prev_time):
                supplier_bests[sid] = (amt, b.submitted_at)

    sorted_suppliers = sorted(supplier_bests.items(), key=lambda x: (x[1][0], x[1][1]))
    ranks = {}
    for index, (sid, _) in enumerate(sorted_suppliers, start=1):
        ranks[sid] = index
    
    l1_supplier = sorted_suppliers[0][0] if sorted_suppliers else None
    return ranks, l1_supplier

# check if bid lands in trigger window and matches extension rules
def evaluate_extension(
    rfq: RFQ,
    supplier: User,
    prev_ranks: Dict[int, int],
    new_ranks: Dict[int, int],
    prev_l1: Optional[int],
    new_l1: Optional[int],
    now: datetime,
    db: Session
) -> Tuple[bool, str]:
    if not rfq.is_british_auction:
        return False, ""

    time_left = rfq.bid_close_time - now
    trigger_delta = timedelta(minutes=rfq.trigger_window_minutes)

    # only trigger extension if within the final X minutes
    if not (timedelta(0) <= time_left <= trigger_delta):
        return False, ""

    should_extend = False
    extension_reason = ""
    trigger_rule = rfq.extension_trigger

    if trigger_rule == "ANY_BID":
        should_extend = True
        extension_reason = f"Bid placed within {rfq.trigger_window_minutes}m window by {supplier.name}"
    elif trigger_rule == "ANY_RANK_CHANGE":
        if prev_ranks != new_ranks:
            should_extend = True
            extension_reason = f"Supplier rank shift occurred within {rfq.trigger_window_minutes}m window"
    elif trigger_rule == "L1_RANK_CHANGE":
        if new_l1 != prev_l1:
            should_extend = True
            extension_reason = f"{supplier.name} became new L1 lowest bidder within {rfq.trigger_window_minutes}m window"

    if not should_extend:
        return False, ""

    # cap extension at hard forced close ceiling
    extra = timedelta(minutes=rfq.extension_duration_minutes)
    tentative_close = rfq.bid_close_time + extra
    extended_close = min(tentative_close, rfq.forced_bid_close_time)

    if extended_close >= rfq.forced_bid_close_time:
        if extended_close > rfq.bid_close_time:
            old_close_str = rfq.bid_close_time.strftime("%H:%M:%S")
            new_close_str = extended_close.strftime("%H:%M:%S")
            rfq.bid_close_time = extended_close
            db.add(ActivityLog(
                rfq_id=rfq.id,
                event_type="AUCTION_EXTENDED",
                message=f"Auction extended by {rfq.extension_duration_minutes}m from {old_close_str} to {new_close_str} (Capped at forced close ceiling). Reason: {extension_reason}",
                created_at=now
            ))
            db.add(ActivityLog(
                rfq_id=rfq.id,
                event_type="EXTENSION_BLOCKED",
                message=f"Auction reached forced close time ({rfq.forced_bid_close_time.strftime('%H:%M:%S')}). Further extensions are blocked.",
                created_at=now
            ))
            return True, extension_reason
        else:
            db.add(ActivityLog(
                rfq_id=rfq.id,
                event_type="EXTENSION_BLOCKED",
                message=f"Extension triggered ({extension_reason}) but forced close time ({rfq.forced_bid_close_time.strftime('%H:%M:%S')}) already reached — no extension applied.",
                created_at=now
            ))
            return False, "EXTENSION_BLOCKED"

    if extended_close > rfq.bid_close_time:
        old_close_str = rfq.bid_close_time.strftime("%H:%M:%S")
        new_close_str = extended_close.strftime("%H:%M:%S")
        rfq.bid_close_time = extended_close
        log_msg = f"Auction extended by {rfq.extension_duration_minutes}m from {old_close_str} to {new_close_str}. Reason: {extension_reason}"
        db.add(ActivityLog(
            rfq_id=rfq.id,
            event_type="AUCTION_EXTENDED",
            message=log_msg,
            created_at=now
        ))
        return True, extension_reason

    return False, ""
