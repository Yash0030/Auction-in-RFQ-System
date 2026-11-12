from datetime import datetime, timedelta
from app.core.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.rfq import RFQ
from app.models.bid import QuoteBid
from app.models.activity_log import ActivityLog
from app.core.security import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

buyer = db.query(User).filter(User.email == "buyer@gocommet.com").first()
if not buyer:
    buyer = User(
        email="buyer@gocommet.com",
        password_hash=hash_password("password123"),
        name="Alex Turner",
        role="BUYER"
    )
    db.add(buyer)
    db.commit()
    db.refresh(buyer)

supplier1 = db.query(User).filter(User.email == "supplier1@oceanfreight.com").first()
if not supplier1:
    supplier1 = User(
        email="supplier1@oceanfreight.com",
        password_hash=hash_password("password123"),
        name="Sarah Jenkins",
        role="SUPPLIER"
    )
    db.add(supplier1)
    db.commit()
    db.refresh(supplier1)

supplier2 = db.query(User).filter(User.email == "supplier2@fastcargo.com").first()
if not supplier2:
    supplier2 = User(
        email="supplier2@fastcargo.com",
        password_hash=hash_password("password123"),
        name="David Chen",
        role="SUPPLIER"
    )
    db.add(supplier2)
    db.commit()
    db.refresh(supplier2)

existing_rfq = db.query(RFQ).filter(RFQ.reference_id == "RFQ-2026-OCEAN-01").first()
if not existing_rfq:
    now = datetime.utcnow()
    rfq = RFQ(
        reference_id="RFQ-2026-OCEAN-01",
        title="40ft High Cube Container Freight - Shanghai to Rotterdam",
        description="Shipment of 10 standard containers of automotive components. Requires temperature monitoring.",
        pickup_date=now + timedelta(days=14),
        bid_start_time=now - timedelta(minutes=30),
        bid_close_time=now + timedelta(minutes=15),
        forced_bid_close_time=now + timedelta(minutes=60),
        is_british_auction=True,
        trigger_window_minutes=10,
        extension_duration_minutes=5,
        extension_trigger="ANY_BID",
        status="ACTIVE",
        created_by=buyer.id
    )
    db.add(rfq)
    db.commit()
    db.refresh(rfq)

    bid1 = QuoteBid(
        rfq_id=rfq.id,
        supplier_id=supplier1.id,
        carrier_name="Maersk Line",
        freight_charges=2200.00,
        origin_charges=350.00,
        destination_charges=450.00,
        total_amount=3000.00,
        transit_time="24 Days",
        quote_validity=(now + timedelta(days=30)).date(),
        submitted_at=now - timedelta(minutes=20)
    )
    db.add(bid1)

    bid2 = QuoteBid(
        rfq_id=rfq.id,
        supplier_id=supplier2.id,
        carrier_name="Hapag-Lloyd",
        freight_charges=2100.00,
        origin_charges=320.00,
        destination_charges=430.00,
        total_amount=2850.00,
        transit_time="22 Days",
        quote_validity=(now + timedelta(days=30)).date(),
        submitted_at=now - timedelta(minutes=15)
    )
    db.add(bid2)

    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="RFQ_CREATED",
        message="RFQ RFQ-2026-OCEAN-01 created with British Auction enabled (ANY_BID, X=10m, Y=5m)"
    ))
    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="BID_SUBMITTED",
        message="Sarah Jenkins submitted initial quote of $3000.00 via Maersk Line"
    ))
    db.add(ActivityLog(
        rfq_id=rfq.id,
        event_type="BID_SUBMITTED",
        message="David Chen submitted initial quote of $2850.00 via Hapag-Lloyd"
    ))
    db.commit()

db.close()
print("Seed completed successfully")
