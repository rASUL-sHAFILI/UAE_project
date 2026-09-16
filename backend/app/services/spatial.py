"""Spatial questions, answered by PostGIS.

These are the queries that justify the database. Each one is a question a
dispatcher asks out loud, and each is answered with an index-backed geometry
operation rather than by loading the table into Python and looping.
"""

from __future__ import annotations

from geoalchemy2.functions import ST_AsGeoJSON, ST_DistanceSphere, ST_MakePoint, ST_SetSRID
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Incident, IncidentStatus, Unit, UnitKind, UnitStatus


def point(lon: float, lat: float):
    """A WGS84 point usable in a query."""
    return ST_SetSRID(ST_MakePoint(lon, lat), 4326)


async def nearest_available_units(
    session: AsyncSession,
    lon: float,
    lat: float,
    *,
    kinds: list[UnitKind] | None = None,
    limit: int = 5,
) -> list[tuple[Unit, float]]:
    """Available units closest to a point, nearest first, with metres.

    Ordered by the index-assisted `<->` operator rather than by computing every
    distance: PostGIS walks the GiST index outwards from the point and stops
    once it has enough, which is what makes this cheap as the fleet grows.
    """
    target = point(lon, lat)

    query = (
        select(Unit, cast(ST_DistanceSphere(Unit.location, target), Float))
        .where(Unit.status == UnitStatus.available)
        .order_by(Unit.location.op("<->")(target))
        .limit(limit)
    )
    if kinds:
        query = query.where(Unit.kind.in_(kinds))

    result = await session.execute(query)
    return [(unit, float(metres)) for unit, metres in result.all()]


async def units_within(
    session: AsyncSession, lon: float, lat: float, radius_m: float
) -> list[Unit]:
    """Every unit inside a radius, whatever it is doing.

    `ST_DWithin` on geography rather than `ST_Distance(...) < r`, so the index
    can be used: the second form has to compute a distance for every row before
    it can compare it.
    """
    target = point(lon, lat)
    query = select(Unit).where(
        func.ST_DWithin(
            cast(Unit.location, func.geography().type),
            cast(target, func.geography().type),
            radius_m,
        )
    )
    return list((await session.execute(query)).scalars().all())


async def open_incidents(session: AsyncSession) -> list[Incident]:
    """Calls still needing work, most urgent first."""
    query = (
        select(Incident)
        .where(Incident.status != IncidentStatus.resolved)
        .order_by(Incident.priority.asc(), Incident.reported_minute.asc())
    )
    return list((await session.execute(query)).scalars().all())


async def unassigned_incidents(session: AsyncSession) -> list[Incident]:
    query = (
        select(Incident)
        .where(Incident.status == IncidentStatus.pending)
        .where(Incident.assigned_unit_id.is_(None))
        .order_by(Incident.priority.asc(), Incident.reported_minute.asc())
    )
    return list((await session.execute(query)).scalars().all())


async def route_geojson(session: AsyncSession, unit: Unit) -> list[list[float]] | None:
    """A unit's current route as a coordinate list, or None if it has no route."""
    if unit.route is None:
        return None

    raw = (await session.execute(select(ST_AsGeoJSON(unit.route)))).scalar_one_or_none()
    if not raw:
        return None

    import json

    return json.loads(raw)["coordinates"]


async def as_lonlat(session: AsyncSession, geometry) -> tuple[float, float]:
    """Read a stored point back as a (lon, lat) pair."""
    result = await session.execute(
        select(cast(func.ST_X(geometry), Float), cast(func.ST_Y(geometry), Float))
    )
    lon, lat = result.one()
    return float(lon), float(lat)
