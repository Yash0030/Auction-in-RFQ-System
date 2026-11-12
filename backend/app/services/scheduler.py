import asyncio
import logging
from app.core.database import SessionLocal
from app.models.rfq import RFQ
from app.services.auction_engine import refresh_rfq_status
from app.services.rfq_service import get_rfq_detail_dict
from app.sockets.server import broadcast_rfq_update

logger = logging.getLogger("auction_scheduler")

_scheduler_task: asyncio.Task = None

# poll draft and active auctions periodically for status transitions
async def run_auction_scheduler(interval_seconds: int = 30):
    logger.info(f"Auction background scheduler loop started (ticking every {interval_seconds}s)")
    while True:
        try:
            db = SessionLocal()
            try:
                rfqs = db.query(RFQ).filter(RFQ.status.in_(["DRAFT", "ACTIVE"])).all()
                for rfq in rfqs:
                    original_status = rfq.status
                    new_status = refresh_rfq_status(rfq, db)
                    if new_status != original_status:
                        logger.info(f"Auction [{rfq.reference_id}] auto-transitioned from {original_status} to {new_status}")
                        try:
                            detail = get_rfq_detail_dict(rfq.id, None, db)
                            await broadcast_rfq_update(rfq.id, detail)
                        except Exception as emit_err:
                            logger.error(f"Failed broadcasting WebSocket update for RFQ {rfq.id}: {emit_err}")
            finally:
                db.close()
        except asyncio.CancelledError:
            logger.info("Auction background scheduler task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in auction scheduler iteration: {e}", exc_info=True)

        await asyncio.sleep(interval_seconds)

def start_scheduler(interval_seconds: int = 30):
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(run_auction_scheduler(interval_seconds))
        logger.info("Background scheduler task initiated.")

def stop_scheduler():
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("Background scheduler task stopped.")
