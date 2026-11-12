from app.routers.auth import router as auth_router
from app.routers.rfqs import router as rfq_router
from app.routers.bids import router as bid_router

all_routers = [
    (auth_router, "/api"),
    (rfq_router, "/api"),
    (bid_router, "/api"),
]

