from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from app.core.config import CORS_ORIGINS
from app.core.database import engine, Base
from app.routers import all_routers
from app.sockets.server import sio
from app.services.scheduler import start_scheduler, stop_scheduler

# create tables if not existing
Base.metadata.create_all(bind=engine)

api = FastAPI(title="British Auction RFQ API")

api.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.on_event("startup")
async def on_startup():
    start_scheduler(interval_seconds=30)

@api.on_event("shutdown")
async def on_shutdown():
    stop_scheduler()

@api.get("/api/health")
def health_check():
    return {"status": "ok"}

for router_obj, prefix in all_routers:
    api.include_router(router_obj, prefix=prefix)

# wrap fastapi in socketio asgi application
app = socketio.ASGIApp(
    sio,
    other_asgi_app=api,
    on_startup=lambda: start_scheduler(interval_seconds=30),
    on_shutdown=stop_scheduler
)
