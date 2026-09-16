"""The simulation: one clock, and everything that follows from it.

This is the service that stands in for the world. It owns the scenario clock,
puts the flood on the ground, delivers calls as they happen, runs the agents
over them and publishes the result. The dashboard is a view of what this
produces and holds no scenario logic of its own.

When real sensors and a real call-taking system exist, this is the only module
that is replaced. Everything downstream — the triage agent, the allocator, the
router, the API, the dashboard — is already reading real geometry and real
terrain and would not know the difference.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point
from sqlalchemy import delete, select

from ..agents import allocator, triage
from ..config import get_settings
from ..db import SessionLocal, reset_database
from ..models import (
    FloodCell,
    Incident,
    IncidentStatus,
    Proposal,
    RiskLevel,
    SimState,
    Unit,
    UnitKind,
    UnitStatus,
)
from ..services.events import bus
from .calls import CallGenerator, GeneratedCall
from .flood_model import FloodModel, FloodSurface
from .places import load_places
from .terrain import AL_MAJAZ_BBOX, MODEL_DOWNSAMPLE, crop, downsample, load_elevation

log = logging.getLogger(__name__)

SCENARIO_DURATION = 180.0
SCENARIO_START = datetime(2026, 8, 14, 16, 20, tzinfo=timezone(timedelta(hours=4)))

#: How often the flood surface is written to the database, in simulated
#: minutes. Every cell of every minute would be millions of rows for a picture
#: that changes slowly; five-minute steps are finer than the model itself moves.
FLOOD_WRITE_INTERVAL = 5.0

#: Emergency service stations around the district.
STATIONS: list[tuple[str, str, UnitKind, float, float]] = [
    ("amb-04", "AMB-04", UnitKind.ambulance, 55.3869, 25.3312),
    ("amb-07", "AMB-07", UnitKind.ambulance, 55.3748, 25.3195),
    ("fire-02", "FIRE-02", UnitKind.fire_truck, 55.3822, 25.3352),
    ("fire-05", "FIRE-05", UnitKind.fire_truck, 55.3910, 25.3220),
    ("pol-11", "POL-11", UnitKind.police, 55.3795, 25.3168),
    ("boat-01", "BOAT-01", UnitKind.rescue_boat, 55.3836, 25.3245),
    ("boat-02", "BOAT-02", UnitKind.rescue_boat, 55.3781, 25.3292),
]


def scenario_time(minute: float) -> datetime:
    return SCENARIO_START + timedelta(minutes=minute)


class SimulationEngine:
    def __init__(self) -> None:
        self.model: FloodModel | None = None
        self.calls: list[GeneratedCall] = []
        self.minute = 0.0
        self.speed = 1.0
        self.is_running = False
        self._delivered: set[int] = set()
        self._last_flood_write = -FLOOD_WRITE_INTERVAL
        self._task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()

    # ---------------------------------------------------------------- setup

    async def prepare(self) -> None:
        """Load the terrain, build the scenario and put it in the database."""
        log.info("loading terrain for Al-Majaz…")
        grid = downsample(crop(await load_elevation(), AL_MAJAZ_BBOX), MODEL_DOWNSAMPLE)
        self.model = FloodModel(grid)
        log.info("terrain ready: %s cells", grid.heights.size)

        places = await load_places(self._flood_samples())
        log.info("%d named places available for calls", len(places))

        self.calls = CallGenerator(self.model, places).generate(SCENARIO_DURATION)

        await reset_database()
        await self._seed_units()

        self.minute = 0.0
        self._delivered.clear()
        self._last_flood_write = -FLOOD_WRITE_INTERVAL
        await self._write_flood(force=True)
        await self._save_state()

        self._ready.set()
        log.info("scenario ready: %d calls over %.0f minutes", len(self.calls), SCENARIO_DURATION)

    def _flood_samples(self) -> list[tuple[float, float]]:
        """Points to ask Mapbox about, spread over ground that actually floods."""
        assert self.model is not None
        import numpy as np

        surface = self.model.surface_at(SCENARIO_DURATION)
        wet = np.argwhere(surface.depth >= 0.3)
        if not len(wet):
            return []

        step = max(1, len(wet) // 18)
        return [
            self.model.grid.cell_centre(int(row), int(col)) for row, col in wet[::step]
        ][:18]

    async def _seed_units(self) -> None:
        async with SessionLocal() as session:
            for unit_id, call_sign, kind, lon, lat in STATIONS:
                position = from_shape(Point(lon, lat), srid=4326)
                session.add(
                    Unit(
                        id=unit_id,
                        call_sign=call_sign,
                        kind=kind,
                        status=UnitStatus.available,
                        location=position,
                        base=position,
                    )
                )
            await session.commit()

    # ----------------------------------------------------------------- loop

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self.is_running = False
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self) -> None:
        await self._ready.wait()
        settings = get_settings()
        tick = 0.5  # seconds of real time

        while True:
            try:
                await asyncio.sleep(tick)
                if not self.is_running:
                    continue

                advance = tick * settings.sim_minutes_per_second * self.speed
                await self.advance_to(min(self.minute + advance, SCENARIO_DURATION))

                if self.minute >= SCENARIO_DURATION:
                    self.is_running = False
                    await self._publish_state()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - one bad tick must not kill the clock
                log.exception("simulation tick failed")

    async def advance_to(self, minute: float) -> None:
        """Move the clock, and apply everything that happens on the way."""
        going_back = minute < self.minute
        self.minute = max(0.0, min(minute, SCENARIO_DURATION))

        if going_back:
            # Scrubbing backwards rewinds the world rather than leaving calls
            # that have not happened yet sitting in the list.
            await self._rewind()

        await self._deliver_due_calls()
        await self._move_units()
        await self._write_flood()
        await self._save_state()
        await self._publish_state()

    # ------------------------------------------------------------- scenario

    async def _deliver_due_calls(self) -> None:
        assert self.model is not None
        surface = self.model.surface_at(self.minute)

        for index, call in enumerate(self.calls):
            if index in self._delivered or call.minute > self.minute:
                continue
            self._delivered.add(index)
            await self._create_incident(index, call, surface)

    async def _create_incident(
        self, index: int, call: GeneratedCall, surface: FloodSurface
    ) -> None:
        assert self.model is not None
        depth = self.model.depth_at(surface, call.place.lon, call.place.lat)

        result = await triage.classify(
            call.transcript_en,
            address=call.place.name,
            water_depth_m=depth,
            people_affected=call.people_affected,
        )

        incident = Incident(
            id=f"inc-{index + 1:03d}",
            kind=call.kind,
            priority=result.priority,
            status=IncidentStatus.pending,
            location=from_shape(Point(call.place.lon, call.place.lat), srid=4326),
            address_az=call.place.name,
            address_en=call.place.name,
            transcript_az=call.transcript_az,
            transcript_en=call.transcript_en,
            people_affected=result.people_affected,
            reported_minute=call.minute,
            reported_at=scenario_time(call.minute),
            triage_rationale=result.rationale,
            triage_source=result.source,
        )

        async with SessionLocal() as session:
            session.add(incident)
            await session.commit()

        await bus.publish(
            {
                "type": "incident.created",
                "incident": {
                    "id": incident.id,
                    "kind": incident.kind.value,
                    "priority": incident.priority,
                    "address": {"az": incident.address_az, "en": incident.address_en},
                    "description": {
                        "az": incident.transcript_az,
                        "en": incident.transcript_en,
                    },
                    "location": [call.place.lon, call.place.lat],
                    "peopleAffected": incident.people_affected,
                    "triageRationale": incident.triage_rationale,
                    "triageSource": incident.triage_source,
                    "reportedAt": incident.reported_at.isoformat(),
                    "reportedAtMinute": incident.reported_minute,
                    "status": incident.status.value,
                },
            }
        )

        await self._allocate(incident)

    async def _allocate(self, incident: Incident) -> None:
        """Ask the allocator what to do, and either do it or ask a human."""
        assert self.model is not None
        surface = self.model.surface_at(self.minute)

        async with SessionLocal() as session:
            incident = await session.get(Incident, incident.id) or incident
            assignment = await allocator.best_unit_for(
                session, incident, self.model, surface
            )
            if assignment is None:
                assignment = await allocator.find_preemption(
                    session, incident, self.model, surface
                )

            if assignment is None:
                log.info("no unit can reach %s", incident.id)
                await self._raise_unreachable(session, incident, surface)
                return

            wording = allocator.describe(assignment)

            if assignment.requires_approval:
                await self._raise_proposal(session, assignment, wording)
                return

            await self._commit_assignment(session, assignment)
            await session.commit()

        await self._publish_units()

    async def _commit_assignment(self, session, assignment: allocator.Assignment) -> None:
        unit = assignment.unit
        incident = assignment.incident

        unit.status = UnitStatus.dispatched
        unit.route = from_shape(LineString(assignment.route.coordinates), srid=4326)
        unit.route_progress = 0.0
        unit.eta_minutes = assignment.route.duration_minutes

        incident.status = IncidentStatus.en_route
        incident.assigned_unit_id = unit.id

        session.add_all([unit, incident])
        log.info(
            "%s -> %s (%.0f min, %s route)",
            unit.call_sign,
            incident.id,
            assignment.route.duration_minutes,
            assignment.route.source,
        )

    async def _raise_unreachable(
        self, session, incident: Incident, surface: FloodSurface
    ) -> None:
        """Tell the operator that nothing can get there, and why."""
        assert self.model is not None
        lon, lat = await spatial_point(session, incident)
        deepest = self.model.depth_at(surface, lon, lat)

        wording = allocator.describe_unreachable(incident, deepest)
        proposal = Proposal(
            id=f"prop-{incident.id}-noaccess",
            agent="allocator",
            risk=RiskLevel.high,
            confidence=0.95,
            title_az=wording["title"]["az"],
            title_en=wording["title"]["en"],
            rationale_az=wording["rationale"]["az"],
            rationale_en=wording["rationale"]["en"],
            impact_az=wording["impact"]["az"],
            impact_en=wording["impact"]["en"],
            incident_id=incident.id,
            raised_minute=self.minute,
            raised_at=scenario_time(self.minute),
        )
        session.add(proposal)
        await session.commit()

        await bus.publish(
            {
                "type": "agent.proposal",
                "proposal": {
                    "id": proposal.id,
                    "agent": proposal.agent,
                    "risk": proposal.risk.value,
                    "confidence": proposal.confidence,
                    "title": {"az": proposal.title_az, "en": proposal.title_en},
                    "rationale": {
                        "az": proposal.rationale_az,
                        "en": proposal.rationale_en,
                    },
                    "impact": {"az": proposal.impact_az, "en": proposal.impact_en},
                    "raisedAt": proposal.raised_at.isoformat(),
                },
            }
        )

    async def _raise_proposal(
        self, session, assignment: allocator.Assignment, wording: dict
    ) -> None:
        proposal = Proposal(
            id=f"prop-{assignment.incident.id}",
            agent="allocator",
            risk=RiskLevel.high,
            confidence=0.88,
            title_az=wording["title"]["az"],
            title_en=wording["title"]["en"],
            rationale_az=wording["rationale"]["az"],
            rationale_en=wording["rationale"]["en"],
            impact_az=wording["impact"]["az"],
            impact_en=wording["impact"]["en"],
            incident_id=assignment.incident.id,
            unit_id=assignment.unit.id,
            raised_minute=self.minute,
            raised_at=scenario_time(self.minute),
        )
        session.add(proposal)
        await session.commit()

        # A decision the operator has to make stops the clock. One that scrolls
        # past while time runs is a decision nobody took.
        self.is_running = False

        await bus.publish(
            {
                "type": "agent.proposal",
                "proposal": {
                    "id": proposal.id,
                    "agent": proposal.agent,
                    "risk": proposal.risk.value,
                    "confidence": proposal.confidence,
                    "title": {"az": proposal.title_az, "en": proposal.title_en},
                    "rationale": {
                        "az": proposal.rationale_az,
                        "en": proposal.rationale_en,
                    },
                    "impact": {"az": proposal.impact_az, "en": proposal.impact_en},
                    "raisedAt": proposal.raised_at.isoformat(),
                },
            }
        )

    async def _move_units(self) -> None:
        """Advance every dispatched unit along its route."""
        async with SessionLocal() as session:
            units = (
                await session.execute(
                    select(Unit).where(Unit.status == UnitStatus.dispatched)
                )
            ).scalars().all()

            changed = False
            for unit in units:
                coordinates = await spatial_route(session, unit)
                if not coordinates or unit.eta_minutes is None:
                    continue

                # Progress is recomputed from the clock rather than accumulated,
                # so scrubbing the timeline puts units where they should be
                # instead of where they happened to get to.
                #
                # The incident is queried rather than read off the relationship:
                # a lazy load inside an async session raises, and the failure
                # only shows up once a unit is actually moving.
                assigned = (
                    await session.execute(
                        select(Incident).where(
                            Incident.assigned_unit_id == unit.id,
                            Incident.status != IncidentStatus.resolved,
                        )
                    )
                ).scalars().first()
                if assigned is None:
                    continue

                travel = max(unit.eta_minutes, 0.1)
                elapsed = self.minute - assigned.reported_minute
                progress = max(0.0, min(elapsed / travel, 1.0))

                index = min(int(progress * (len(coordinates) - 1)), len(coordinates) - 1)
                lon, lat = coordinates[index]
                unit.location = from_shape(Point(lon, lat), srid=4326)
                unit.route_progress = progress

                if progress >= 1.0:
                    unit.status = UnitStatus.busy
                    unit.eta_minutes = None
                    assigned.status = IncidentStatus.assigned
                    session.add(assigned)

                session.add(unit)
                changed = True

            if changed:
                await session.commit()

        if units:
            await self._publish_units()

    async def _write_flood(self, force: bool = False) -> None:
        """Persist the current flood surface, at a sensible interval."""
        assert self.model is not None
        if not force and self.minute - self._last_flood_write < FLOOD_WRITE_INTERVAL:
            return

        self._last_flood_write = self.minute
        surface = self.model.surface_at(self.minute)
        cells = self.model.wet_cells(surface)

        async with SessionLocal() as session:
            await session.execute(delete(FloodCell))
            for lon, lat, depth, elevation in cells:
                session.add(
                    FloodCell(
                        minute=self.minute,
                        location=from_shape(Point(lon, lat), srid=4326),
                        depth=depth,
                        elevation=elevation,
                    )
                )
            await session.commit()

    async def _rewind(self) -> None:
        """Drop everything that has not happened yet at the current minute."""
        async with SessionLocal() as session:
            await session.execute(
                delete(Proposal).where(Proposal.raised_minute > self.minute)
            )
            await session.execute(
                delete(Incident).where(Incident.reported_minute > self.minute)
            )
            await session.commit()

        self._delivered = {
            index for index, call in enumerate(self.calls) if call.minute <= self.minute
        }

    # ---------------------------------------------------------------- state

    async def _save_state(self) -> None:
        async with SessionLocal() as session:
            state = await session.get(SimState, 1)
            if state is None:
                state = SimState(id=1)
                session.add(state)
            state.minute = self.minute
            state.is_running = self.is_running
            state.speed = self.speed
            await session.commit()

    def snapshot(self) -> dict[str, object]:
        assert self.model is not None
        surface = self.model.surface_at(self.minute)
        return {
            "minute": round(self.minute, 2),
            "isRunning": self.is_running,
            "speed": self.speed,
            "waterLevel": round(surface.level, 3),
            "peakDepth": round(surface.peak_depth, 2),
            "floodedAreaM2": round(self.model.flooded_area_m2(surface), 1),
            "roadAccessCut": allocator.road_access_cut(surface),
        }

    async def _publish_state(self) -> None:
        await bus.publish({"type": "sim.state", "state": self.snapshot()})

    async def _publish_units(self) -> None:
        from ..api.serialisers import units_payload

        async with SessionLocal() as session:
            await bus.publish({"type": "units.updated", "units": await units_payload(session)})


async def spatial_point(session, incident: Incident) -> tuple[float, float]:
    from ..services import spatial

    return await spatial.as_lonlat(session, incident.location)


async def spatial_route(session, unit: Unit) -> list[list[float]] | None:
    from ..services import spatial

    return await spatial.route_geojson(session, unit)


#: One engine per process.
engine = SimulationEngine()
