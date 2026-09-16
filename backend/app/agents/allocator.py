"""Agent 2 — resource allocation.

Decides which unit goes to which call, and says what it is giving up to do it.

The interesting case is not "send the nearest ambulance". It is the one where
the nearest ambulance cannot get there, or where the only free boat is already
on its way to somebody who is safe on a roof and a cardiac arrest has just come
in. Those are the decisions the approval step exists for, and this is where they
are found.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Incident, Unit, UnitKind, UnitStatus
from ..services import spatial
from ..sim.flood_model import FloodModel, FloodSurface
from .router import IMPASSABLE_DEPTH, Route, plan_route

log = logging.getLogger(__name__)

#: Which units can answer which kind of call, best first.
SUITABLE_UNITS: dict[str, list[UnitKind]] = {
    "medical": [UnitKind.ambulance, UnitKind.rescue_boat],
    "fire": [UnitKind.fire_truck],
    "rescue": [UnitKind.rescue_boat, UnitKind.fire_truck],
    "flood": [UnitKind.fire_truck, UnitKind.police],
    "traffic": [UnitKind.police],
}


@dataclass
class Assignment:
    """A unit, a call, the road between them, and what it costs."""

    incident: Incident
    unit: Unit
    route: Route
    #: Set when taking this unit means abandoning something it was already on.
    preempts: Incident | None = None

    @property
    def requires_approval(self) -> bool:
        """Anything that takes a committed unit off someone is a human's call."""
        return self.preempts is not None


async def best_unit_for(
    session: AsyncSession,
    incident: Incident,
    model: FloodModel,
    surface: FloodSurface,
    *,
    candidates_per_kind: int = 4,
) -> Assignment | None:
    """The best available unit that can actually reach this call.

    "Can actually reach" is the whole job. PostGIS gives the nearest available
    units by straight-line distance, which is only a shortlist; each one is then
    routed over real roads and the route is checked against the flood. A unit
    that is nearest but cut off is not a candidate at all.
    """
    lon, lat = await spatial.as_lonlat(session, incident.location)
    kinds = SUITABLE_UNITS.get(incident.kind.value, list(UnitKind))

    nearest = await spatial.nearest_available_units(
        session, lon, lat, kinds=kinds, limit=candidates_per_kind
    )
    if not nearest:
        return None

    best: Assignment | None = None
    for unit, _straight_line_m in nearest:
        unit_lon, unit_lat = await spatial.as_lonlat(session, unit.location)
        route = await plan_route(
            (unit_lon, unit_lat), (lon, lat), unit.kind.value, model, surface
        )

        if not route.passable:
            log.info(
                "%s cannot reach %s: %.2f m of water on the route",
                unit.call_sign,
                incident.id,
                route.max_depth_m,
            )
            continue

        if best is None or route.duration_s < best.route.duration_s:
            best = Assignment(incident=incident, unit=unit, route=route)

    return best


async def find_preemption(
    session: AsyncSession,
    incident: Incident,
    model: FloodModel,
    surface: FloodSurface,
) -> Assignment | None:
    """When nothing is free, find the least bad unit to take off another call.

    Only ever takes a unit from a call that is strictly less urgent, and never
    from one where somebody is in the water. The result is a proposal, not an
    action: this is exactly the decision a person has to make.
    """
    lon, lat = await spatial.as_lonlat(session, incident.location)
    kinds = SUITABLE_UNITS.get(incident.kind.value, list(UnitKind))

    open_calls = await spatial.open_incidents(session)
    by_unit = {call.assigned_unit_id: call for call in open_calls if call.assigned_unit_id}

    best: Assignment | None = None
    for unit_id, current in by_unit.items():
        unit = await session.get(Unit, unit_id)
        if unit is None or unit.kind not in kinds:
            continue
        # Never rob a more urgent call to serve a less urgent one.
        if current.priority <= incident.priority:
            continue

        unit_lon, unit_lat = await spatial.as_lonlat(session, unit.location)
        route = await plan_route(
            (unit_lon, unit_lat), (lon, lat), unit.kind.value, model, surface
        )
        if not route.passable:
            continue

        if best is None or route.duration_s < best.route.duration_s:
            best = Assignment(
                incident=incident, unit=unit, route=route, preempts=current
            )

    return best


def describe(assignment: Assignment) -> dict[str, dict[str, str]]:
    """The wording the approval modal shows, in both languages.

    Built from the numbers that produced the decision — the route time, the
    depth that ruled the alternatives out, what the preempted call loses — so
    the operator is reading the reasoning rather than a summary of it.
    """
    unit = assignment.unit
    route = assignment.route
    minutes = route.duration_minutes

    if assignment.preempts is None:
        return {
            "title": {
                "az": f"{unit.call_sign} → {assignment.incident.address_az}",
                "en": f"{unit.call_sign} → {assignment.incident.address_en}",
            },
            "rationale": {
                "az": (
                    f"Ən yaxın çata bilən briqada. Marşrut {route.distance_m / 1000:.1f} km, "
                    f"{minutes:.0f} dəqiqə, yolda ən dərin su {route.max_depth_m:.2f} m."
                ),
                "en": (
                    f"Nearest unit that can actually reach it. Route is "
                    f"{route.distance_m / 1000:.1f} km, {minutes:.0f} minutes, deepest "
                    f"water on the way {route.max_depth_m:.2f} m."
                ),
            },
            "impact": {
                "az": f"{unit.call_sign} bu çağırışa bağlanır.",
                "en": f"{unit.call_sign} is committed to this call.",
            },
        }

    preempted = assignment.preempts
    return {
        "title": {
            "az": f"{unit.call_sign} {preempted.address_az} çağırışından götürülsün",
            "en": f"Take {unit.call_sign} off {preempted.address_en}",
        },
        "rationale": {
            "az": (
                f"Boş briqada qalmayıb. Bu çağırış P{assignment.incident.priority}, "
                f"hazırkı isə P{preempted.priority}. Çatma vaxtı {minutes:.0f} dəqiqə."
            ),
            "en": (
                f"No unit is free. This call is P{assignment.incident.priority} against "
                f"P{preempted.priority} for the one it is on. Arrival in {minutes:.0f} minutes."
            ),
        },
        "impact": {
            "az": (
                f"{preempted.address_az} çağırışı təyinatsız qalır"
                + (
                    f", {preempted.people_affected} nəfər gözləyir."
                    if preempted.people_affected
                    else "."
                )
            ),
            "en": (
                f"{preempted.address_en} is left unassigned"
                + (
                    f", with {preempted.people_affected} people waiting."
                    if preempted.people_affected
                    else "."
                )
            ),
        },
    }


def road_access_cut(surface: FloodSurface) -> bool:
    """Whether the flood has passed the depth that stops road vehicles."""
    return surface.peak_depth >= IMPASSABLE_DEPTH


def describe_unreachable(incident: Incident, deepest_m: float) -> dict[str, dict[str, str]]:
    """Wording for a call nothing can currently reach.

    Silence is the wrong answer here. A call that sits pending with no unit and
    no explanation looks like the system forgot it, and the operator has no way
    to tell that apart from a system that has correctly worked out that every
    road is under water and is waiting for a boat.
    """
    people = incident.people_affected
    return {
        "title": {
            "az": f"{incident.address_az}: çatan briqada yoxdur",
            "en": f"{incident.address_en}: no unit can reach",
        },
        "rationale": {
            "az": (
                f"Bütün yol marşrutlarında su {deepest_m:.2f} m-ə çatır, "
                f"{IMPASSABLE_DEPTH:.2f} m həddini aşır. Boş qayıq yoxdur."
            ),
            "en": (
                f"Every road route carries up to {deepest_m:.2f} m of water, over the "
                f"{IMPASSABLE_DEPTH:.2f} m limit. No boat is free."
            ),
        },
        "impact": {
            "az": (
                "Çağırış qayıq boşalana qədər gözləyir"
                + (f", {people} nəfər gözləyir." if people else ".")
            ),
            "en": (
                "The call waits until a boat frees up"
                + (f", with {people} people waiting." if people else ".")
            ),
        },
    }
