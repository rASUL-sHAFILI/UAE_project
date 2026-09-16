"""Turning rows into the payloads the dashboard expects.

Geometry columns come back as WKB and have to be read through PostGIS rather
than unpacked in Python, so these helpers do it in one query per collection
instead of one per row.
"""

from __future__ import annotations

import json

from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Incident, IncidentStatus, Unit


def _coordinates(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    return json.loads(raw)["coordinates"]


async def incidents_payload(session: AsyncSession) -> list[dict]:
    rows = (
        await session.execute(
            select(Incident, ST_AsGeoJSON(Incident.location)).order_by(
                Incident.priority.asc(), Incident.reported_minute.asc()
            )
        )
    ).all()

    return [
        {
            "id": incident.id,
            "kind": incident.kind.value,
            "priority": incident.priority,
            "status": incident.status.value,
            "location": _coordinates(geometry),
            "address": {"az": incident.address_az, "en": incident.address_en},
            "description": {
                "az": incident.transcript_az,
                "en": incident.transcript_en,
            },
            "reportedAt": incident.reported_at.isoformat(),
            "reportedAtMinute": incident.reported_minute,
            "assignedUnitId": incident.assigned_unit_id,
            "peopleAffected": incident.people_affected,
            "triageRationale": incident.triage_rationale,
            "triageSource": incident.triage_source,
        }
        for incident, geometry in rows
    ]


async def units_payload(session: AsyncSession) -> list[dict]:
    rows = (
        await session.execute(
            select(
                Unit,
                ST_AsGeoJSON(Unit.location),
                ST_AsGeoJSON(Unit.route),
            ).order_by(Unit.call_sign)
        )
    ).all()

    assignments = {
        incident.assigned_unit_id: incident.id
        for incident in (
            await session.execute(
                select(Incident).where(
                    Incident.assigned_unit_id.isnot(None),
                    Incident.status != IncidentStatus.resolved,
                )
            )
        )
        .scalars()
        .all()
    }

    return [
        {
            "id": unit.id,
            "callSign": unit.call_sign,
            "kind": unit.kind.value,
            "status": unit.status.value,
            "location": _coordinates(location),
            "assignedIncidentId": assignments.get(unit.id),
            "etaMinutes": unit.eta_minutes,
            "route": _coordinates(route),
        }
        for unit, location, route in rows
    ]
