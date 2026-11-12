from datetime import datetime, timedelta
from app.core.database import SessionLocal
from app.models.user import User
from app.models.rfq import RFQ
from app.models.bid import QuoteBid
from app.models.activity_log import ActivityLog
from app.schemas.bid import QuoteBidCreate
from app.services.bidding_service import submit_quote_bid
from app.services.auction_engine import calculate_supplier_ranks
from app.core.security import hash_password
from fastapi import HTTPException

db = SessionLocal()

buyer = db.query(User).filter(User.email == "test_buyer@gocommet.com").first()
if not buyer:
    buyer = User(
        email="test_buyer@gocommet.com",
        password_hash=hash_password("password123"),
        name="Test Buyer",
        role="BUYER"
    )
    db.add(buyer)
    db.commit()
    db.refresh(buyer)

supplier1 = db.query(User).filter(User.email == "test_sup1@oceanfreight.com").first()
if not supplier1:
    supplier1 = User(
        email="test_sup1@oceanfreight.com",
        password_hash=hash_password("password123"),
        name="Test Supplier 1",
        role="SUPPLIER"
    )
    db.add(supplier1)
    db.commit()
    db.refresh(supplier1)

supplier2 = db.query(User).filter(User.email == "test_sup2@fastcargo.com").first()
if not supplier2:
    supplier2 = User(
        email="test_sup2@fastcargo.com",
        password_hash=hash_password("password123"),
        name="Test Supplier 2",
        role="SUPPLIER"
    )
    db.add(supplier2)
    db.commit()
    db.refresh(supplier2)

now = datetime.now()
test_rfq = RFQ(
    reference_id=f"TEST-RFQ-{int(now.timestamp())}",
    title="Automated Test British Auction RFQ",
    description="Validation test for auction extension rules",
    pickup_date=now + timedelta(days=5),
    bid_start_time=now - timedelta(minutes=10),
    bid_close_time=now + timedelta(minutes=4),
    forced_bid_close_time=now + timedelta(minutes=10),
    is_british_auction=True,
    trigger_window_minutes=5,
    extension_duration_minutes=3,
    extension_trigger="ANY_BID",
    status="ACTIVE",
    created_by=buyer.id
)
db.add(test_rfq)
db.commit()
db.refresh(test_rfq)

initial_close = test_rfq.bid_close_time

bid_payload1 = QuoteBidCreate(
    carrier_name="Carrier Alpha",
    freight_charges=1000.0,
    origin_charges=100.0,
    destination_charges=100.0,
    transit_time="10 Days",
    quote_validity=(now + timedelta(days=10)).date()
)

bid1, ext1, rsn1 = submit_quote_bid(
    rfq_id=test_rfq.id,
    payload=bid_payload1,
    supplier=supplier1,
    db=db
)

assert bid1.total_amount == 1200.0
assert ext1 is True
assert test_rfq.bid_close_time > initial_close

bid_payload2 = QuoteBidCreate(
    carrier_name="Carrier Beta",
    freight_charges=900.0,
    origin_charges=100.0,
    destination_charges=100.0,
    transit_time="9 Days",
    quote_validity=(now + timedelta(days=10)).date()
)

bid2, ext2, rsn2 = submit_quote_bid(
    rfq_id=test_rfq.id,
    payload=bid_payload2,
    supplier=supplier2,
    db=db
)

assert bid2.total_amount == 1100.0
ranks, l1 = calculate_supplier_ranks(test_rfq.id, db)
assert l1 == supplier2.id
assert ranks[supplier2.id] == 1
assert ranks[supplier1.id] == 2

try:
    higher_payload = QuoteBidCreate(
        carrier_name="Carrier Beta",
        freight_charges=950.0,
        origin_charges=100.0,
        destination_charges=100.0,
        transit_time="9 Days",
        quote_validity=(now + timedelta(days=10)).date()
    )
    submit_quote_bid(
        rfq_id=test_rfq.id,
        payload=higher_payload,
        supplier=supplier2,
        db=db
    )
    assert False, "Higher bid by same supplier should fail"
except HTTPException:
    pass

test_rfq.bid_close_time = now + timedelta(minutes=3)
test_rfq.forced_bid_close_time = test_rfq.bid_close_time
db.commit()

bid_payload3 = QuoteBidCreate(
    carrier_name="Carrier Alpha",
    freight_charges=800.0,
    origin_charges=50.0,
    destination_charges=50.0,
    transit_time="8 Days",
    quote_validity=(now + timedelta(days=10)).date()
)

bid3, ext3, rsn3 = submit_quote_bid(
    rfq_id=test_rfq.id,
    payload=bid_payload3,
    supplier=supplier1,
    db=db
)

assert ext3 is False
assert rsn3 == "EXTENSION_BLOCKED"

blocked_logs = db.query(ActivityLog).filter(
    ActivityLog.rfq_id == test_rfq.id,
    ActivityLog.event_type == "EXTENSION_BLOCKED"
).all()
assert len(blocked_logs) >= 1
print(f"Verified EXTENSION_BLOCKED log: {blocked_logs[-1].message}")

rfq_ids = [r.id for r in db.query(RFQ).filter(RFQ.created_by == buyer.id).all()]
if rfq_ids:
    db.query(ActivityLog).filter(ActivityLog.rfq_id.in_(rfq_ids)).delete(synchronize_session=False)
    db.query(QuoteBid).filter(QuoteBid.rfq_id.in_(rfq_ids)).delete(synchronize_session=False)
    db.query(RFQ).filter(RFQ.id.in_(rfq_ids)).delete(synchronize_session=False)
db.query(User).filter(User.id.in_([buyer.id, supplier1.id, supplier2.id])).delete(synchronize_session=False)
db.commit()

db.close()
print("All modular auction engine tests passed successfully")
