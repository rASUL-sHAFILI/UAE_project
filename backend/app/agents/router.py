"""Agent 3 — routing, over real roads.

Straight lines were a placeholder and they lie in the one way that matters
here: they cross water. A unit routed straight to a call on the far side of
Khalid Lagoon is being sent across a lagoon, and the arrival time that comes
out of it is fiction.

This asks Mapbox Directions for the road a vehicle would actually drive, and
then asks the flood model whether that road is still passable. A route that
crosses water deeper than a vehicle can ford is rejected and the caller is told
why, which is the input the allocator needs to decide that this call belongs to
a boat.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from ..config import get_settings
from ..sim.flood_model import FloodModel, FloodSurface

log = logging.getLogger(__name__)

#: Depth at which a road vehicle can no longer be sent. Well under the depth
#: that floats a car — the point is the crew arriving, not the crew coping.
IMPASSABLE_DEPTH = 0.45

#: Mapbox profiles, by what the unit is.
PROFILE_BY_KIND = {
    "ambulance": "driving",
    "fire_truck": "driving",
    "police": "driving",
    # There is no marine profile. A boat goes in a straight line over water,
    # which for once is the honest model: open water has no roads.
    "rescue_boat": None,
}


@dataclass
class Route:
    """A path a unit can take, with the numbers that came back with it."""

    coordinates: list[tuple[float, float]]
    distance_m: float
    duration_s: float
    #: Deepest standing water anywhere along it.
    max_depth_m: float
    #: True when a road vehicle can still drive it.
    passable: bool
    source: str  # "mapbox" or "direct"

    @property
    def duration_minutes(self) -> float:
        return self.duration_s / 60.0


async def road_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    profile: str = "driving",
) -> tuple[list[tuple[float, float]], float, float] | None:
    """Ask Mapbox Directions for a real road route.

    Returns None rather than raising when the service is unreachable or has no
    route: the caller falls back to a direct line and says so, which keeps the
    demo running on a bad connection instead of failing in front of an
    audience.
    """
    settings = get_settings()
    if not settings.mapbox_token:
        return None

    url = (
        f"https://api.mapbox.com/directions/v5/mapbox/{profile}/"
        f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
    )
    params = {
        "geometries": "geojson",
        "overview": "full",
        "access_token": settings.mapbox_token,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        log.warning("directions request failed: %s", error)
        return None

    routes = payload.get("routes") or []
    if not routes:
        return None

    best = routes[0]
    coordinates = [(float(lon), float(lat)) for lon, lat in best["geometry"]["coordinates"]]
    return coordinates, float(best["distance"]), float(best["duration"])


def _direct_line(
    origin: tuple[float, float], destination: tuple[float, float], steps: int = 24
) -> list[tuple[float, float]]:
    return [
        (
            origin[0] + (destination[0] - origin[0]) * i / steps,
            origin[1] + (destination[1] - origin[1]) * i / steps,
        )
        for i in range(steps + 1)
    ]


def deepest_water_on(
    coordinates: list[tuple[float, float]],
    model: FloodModel,
    surface: FloodSurface,
) -> float:
    """The worst standing water anywhere along a path."""
    return max(
        (model.depth_at(surface, lon, lat) for lon, lat in coordinates),
        default=0.0,
    )


async def plan_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    unit_kind: str,
    model: FloodModel,
    surface: FloodSurface,
    *,
    boat_speed_ms: float = 5.5,
) -> Route:
    """Plan a unit's journey and judge whether the flood allows it."""
    profile = PROFILE_BY_KIND.get(unit_kind, "driving")

    if profile is None:
        coordinates = _direct_line(origin, destination)
        distance = _length_m(coordinates)
        return Route(
            coordinates=coordinates,
            distance_m=distance,
            duration_s=distance / boat_speed_ms,
            max_depth_m=deepest_water_on(coordinates, model, surface),
            # A boat is not stopped by depth; it is stopped by the absence of it.
            passable=True,
            source="direct",
        )

    road = await road_route(origin, destination, profile)
    if road is None:
        coordinates = _direct_line(origin, destination)
        distance = _length_m(coordinates)
        # 30 km/h through a flooded city centre, and flagged as a fallback so
        # nothing downstream mistakes this for a real road time.
        duration = distance / (30_000 / 3600)
        source = "direct"
    else:
        coordinates, distance, duration = road
        source = "mapbox"

    max_depth = deepest_water_on(coordinates, model, surface)

    return Route(
        coordinates=coordinates,
        distance_m=distance,
        duration_s=duration,
        max_depth_m=max_depth,
        passable=max_depth < IMPASSABLE_DEPTH,
        source=source,
    )


def _length_m(coordinates: list[tuple[float, float]]) -> float:
    import math

    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coordinates, coordinates[1:], strict=False):
        mid_lat = math.radians((lat1 + lat2) / 2)
        dx = (lon2 - lon1) * 111_320.0 * math.cos(mid_lat)
        dy = (lat2 - lat1) * 110_574.0
        total += math.hypot(dx, dy)
    return total
