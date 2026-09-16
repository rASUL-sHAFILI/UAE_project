"""The WebSocket fan-out.

One process, many dashboards. The simulation and the agents publish events
here; every connected client gets them. Nothing is buffered for a client that
is not listening — the dashboard asks for the current state over HTTP when it
connects and the socket only carries what changes after that, which keeps the
reconnect path simple and means a client that was away does not replay an hour
of history at once.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        log.info("dashboard connected (%d listening)", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)
        log.info("dashboard disconnected (%d listening)", len(self._clients))

    async def publish(self, event: dict[str, Any]) -> None:
        """Send one event to everyone still listening.

        A send can fail because a browser tab closed between the snapshot of
        the client set and the write. That is normal, not an error worth
        surfacing, so the client is dropped quietly and the others still get
        their event.
        """
        async with self._lock:
            clients = list(self._clients)

        if not clients:
            return

        results = await asyncio.gather(
            *(client.send_json(event) for client in clients),
            return_exceptions=True,
        )

        dead = [
            client
            for client, result in zip(clients, results, strict=True)
            if isinstance(result, Exception)
        ]
        if dead:
            async with self._lock:
                for client in dead:
                    self._clients.discard(client)

    @property
    def listener_count(self) -> int:
        return len(self._clients)


#: Module-level singleton. The simulation loop, the agents and the request
#: handlers all publish through the same instance.
bus = EventBus()
