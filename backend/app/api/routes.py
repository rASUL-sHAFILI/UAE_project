"""HTTP surface.

The dashboard reads the whole picture once over HTTP when it connects, then
keeps up over the WebSocket. Commands go over HTTP too, where they get status
codes: a socket that silently swallows a failed dispatch is worse than one that
carries nothing at all.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import FloodCell, Incident, IncidentStatus, Proposal, Unit, UnitStatus
from ..schemas import DecisionIn, SimControlIn
from ..services.events import bus
from ..sim.engine import engine
from .serialisers import incidents_payload, units_payload

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/state")
async def read_state(session: AsyncSession = Depends(get_session)) -> dict:
    """Everything the dashboard needs to draw itself from cold.

    One request rather than four, because a dispatcher opening the screen
    during an incident should not watch it assemble itself in pieces.
    """
    pending = (
        await session.execute(select(Proposal).where(Proposal.approved.is_(None)))
    ).scalars().all()

    return {
        "sim": engine.snapshot(),
        "incidents": await incidents_payload(session),
        "units": await units_payload(session),
        "proposals": [
            {
                "id": proposal.id,
                "agent": proposal.agent,
                "risk": proposal.risk.value,
                "confidence": proposal.confidence,
                "title": {"az": proposal.title_az, "en": proposal.title_en},
                "rationale": {"az": proposal.rationale_az, "en": proposal.rationale_en},
                "impact": {"az": proposal.impact_az, "en": proposal.impact_en},
                "autoApproveSeconds": proposal.auto_approve_seconds,
                "raisedAt": proposal.raised_at.isoformat(),
            }
            for proposal in pending
        ],
    }


@router.get("/flood")
async def read_flood(session: AsyncSession = Depends(get_session)) -> dict:
    """The current flood surface, as GeoJSON points with depth.

    Points rather than polygons: the dashboard draws them as a heatmap and as
    extruded water, and both want the sample grid rather than an outline
    somebody else has already decided the shape of.
    """
    rows = (
        await session.execute(
            select(FloodCell.depth, FloodCell.elevation, ST_AsGeoJSON(FloodCell.location))
        )
    ).all()

    import json

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(geometry),
                "properties": {"depth": round(depth, 2), "elevation": round(elevation, 2)},
            }
            for depth, elevation, geometry in rows
        ],
    }


@router.post("/sim")
async def control_sim(control: SimControlIn) -> dict:
    """Play, pause, change speed or scrub the scenario."""
    if control.speed is not None:
        if not 0.25 <= control.speed <= 8:
            raise HTTPException(422, "speed must be between 0.25 and 8")
        engine.speed = control.speed

    if control.minute is not None:
        await engine.advance_to(control.minute)

    if control.is_running is not None:
        engine.is_running = control.is_running

    return engine.snapshot()


@router.post("/sim/reset")
async def reset_sim() -> dict:
    """Rebuild the scenario from the start."""
    await engine.prepare()
    await bus.publish({"type": "sim.reset"})
    return engine.snapshot()


@router.post("/proposals/{proposal_id}/decision")
async def decide(
    proposal_id: str,
    decision: DecisionIn,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Record a human's answer to an agent, and act on it if approved."""
    proposal = await session.get(Proposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "no such proposal")
    if proposal.approved is not None:
        raise HTTPException(409, "already decided")

    proposal.approved = decision.approved
    proposal.decided_by = decision.decided_by
    proposal.decided_minute = engine.minute
    session.add(proposal)

    if decision.approved and proposal.unit_id and proposal.incident_id:
        await _apply_preemption(session, proposal.unit_id, proposal.incident_id)

    await session.commit()

    await bus.publish(
        {
            "type": "agent.decision",
            "proposalId": proposal_id,
            "approved": decision.approved,
            "decidedBy": decision.decided_by,
        }
    )
    await bus.publish({"type": "units.updated", "units": await units_payload(session)})
    await bus.publish(
        {"type": "incidents.updated", "incidents": await incidents_payload(session)}
    )

    return {"status": "recorded", "approved": decision.approved}


async def _apply_preemption(
    session: AsyncSession, unit_id: str, incident_id: str
) -> None:
    """Move a unit onto the call the operator just approved.

    The call it was on goes back to pending rather than being marked resolved:
    it still needs somebody, and quietly closing it would hide the cost of the
    decision that was just taken.
    """
    previous = (
        await session.execute(
            select(Incident).where(
                Incident.assigned_unit_id == unit_id,
                Incident.status != IncidentStatus.resolved,
            )
        )
    ).scalars().first()

    if previous is not None and previous.id != incident_id:
        previous.assigned_unit_id = None
        previous.status = IncidentStatus.pending
        session.add(previous)

    incident = await session.get(Incident, incident_id)
    if incident is not None:
        incident.assigned_unit_id = unit_id
        incident.status = IncidentStatus.en_route
        session.add(incident)

    unit = await session.get(Unit, unit_id)
    if unit is not None:
        unit.status = UnitStatus.dispatched
        unit.route_progress = 0.0
        session.add(unit)
