"""Al-Majaz emergency response API."""

from __future__ import annotations

import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .db import engine as db_engine, init_database
from .api.routes import router
from .services.events import bus
from .sim.engine import engine as simulation

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("app")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_database()
    log.info("database ready")
    log.info(
        "capabilities: mapbox=%s anthropic=%s",
        settings.has_mapbox,
        settings.has_anthropic,
    )
    # Building the scenario reaches out to Mapbox for terrain and places on a
    # cold cache, which takes long enough that doing it inside the first
    # request would look like a hang. It runs in the background instead and the
    # API answers /health throughout.
    asyncio.create_task(_prepare_scenario())

    yield

    await simulation.stop()
    await db_engine.dispose()


app = FastAPI(
    title="Al-Majaz Emergency Response",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _prepare_scenario() -> None:
    try:
        await simulation.prepare()
        await simulation.start()
    except Exception:  # noqa: BLE001 - the API must stay up and say what failed
        log.exception("scenario preparation failed")


@app.get("/health")
async def health() -> dict[str, object]:
    """Liveness plus the two facts that decide what the system can actually do.

    Reported rather than assumed: without a Mapbox token there is no real
    routing and no real terrain, and without an Anthropic key the triage agent
    falls back to rules. Both are survivable and neither should be silent.
    """
    async with db_engine.connect() as connection:
        postgis = (await connection.execute(text("SELECT postgis_version()"))).scalar_one()

    return {
        "status": "ok",
        "postgis": postgis,
        "mapbox": settings.has_mapbox,
        "anthropic": settings.has_anthropic,
        "listeners": bus.listener_count,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """The dashboard's live feed.

    Receive-only from the client's side in practice; the loop exists to notice
    the disconnect. Commands go over HTTP, where they get status codes.
    """
    await bus.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await bus.disconnect(websocket)
