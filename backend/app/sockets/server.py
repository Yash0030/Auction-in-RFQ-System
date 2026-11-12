import socketio

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

@sio.event
async def connect(sid, environ):
    pass

@sio.event
async def disconnect(sid):
    pass

@sio.event
async def join_rfq(sid, data):
    rfq_id = data.get("rfq_id")
    if rfq_id:
        room = f"rfq_{rfq_id}"
        await sio.enter_room(sid, room)

@sio.event
async def leave_rfq(sid, data):
    rfq_id = data.get("rfq_id")
    if rfq_id:
        room = f"rfq_{rfq_id}"
        await sio.leave_room(sid, room)

async def broadcast_rfq_update(rfq_id: int, payload: dict):
    try:
        await sio.emit("rfq_updated", payload, room=f"rfq_{rfq_id}")
        await sio.emit("rfq_list_updated", {"rfq_id": rfq_id})
    except Exception:
        pass

async def broadcast_rfq_deleted(rfq_id: int):
    try:
        await sio.emit("rfq_deleted", {"rfq_id": rfq_id}, room=f"rfq_{rfq_id}")
        await sio.emit("rfq_list_updated", {"rfq_id": rfq_id, "deleted": True})
    except Exception:
        pass

