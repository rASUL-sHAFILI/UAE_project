"""Emergency calls, generated from the flood rather than from a script.

The first version of this scenario had fifteen calls written by hand at
coordinates chosen to suit the story. These are derived instead: the flood
model says which ground is under water at a given minute, the Mapbox Streets
tileset says what is actually at that spot, and a call comes from there.

The words a caller says are templated — nobody has recordings of Sharjah's
emergency line, and inventing them is the one part of this that has to be
invented. Everything the system reasons about afterwards is real: where the
call is, how deep the water there is, what is at that address, and whether a
road vehicle can still reach it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..models import IncidentKind
from .flood_model import FloodModel
from .places import Place

log = logging.getLogger(__name__)

#: Calls are generated at roughly this rate once the flood is developing.
CALLS_PER_HOUR = 7.0

#: A caller reports water where they are standing, so calls are drawn from
#: places with at least this much of it. Below it they would just be wet.
MIN_CALL_DEPTH = 0.15


@dataclass(frozen=True)
class GeneratedCall:
    place: Place
    kind: IncidentKind
    minute: float
    transcript_az: str
    transcript_en: str
    people_affected: int | None
    water_depth_m: float


#: One template per kind, in both languages. `{place}` is the real name and
#: `{depth}` is what the model says the water is at that exact point.
TEMPLATES: dict[str, tuple[str, str, tuple[int, int] | None]] = {
    "flood": (
        "{place} yanında su {depth:.1f} metrə çatıb, avtomobillər su altındadır.",
        "Water has reached {depth:.1f} m by {place}; vehicles are submerged.",
        None,
    ),
    "rescue": (
        "{place} içində insanlar qalıb, çıxış yolu su altındadır ({depth:.1f} m).",
        "People are cut off inside {place}; the way out is under {depth:.1f} m of water.",
        (2, 12),
    ),
    "medical": (
        "{place} yaxınlığında xəstə var, təcili tibbi yardım lazımdır. Suyun dərinliyi {depth:.1f} m.",
        "A patient near {place} needs urgent medical help. Water is {depth:.1f} m deep.",
        (1, 2),
    ),
    "fire": (
        "{place} binasında yanğın var, tüstü yayılır. Ətrafda {depth:.1f} m su var.",
        "Fire at {place} with smoke spreading. There is {depth:.1f} m of water around it.",
        (5, 40),
    ),
    "traffic": (
        "{place} qarşısında yol bağlanıb, nəqliyyat hərəkət edə bilmir.",
        "The road in front of {place} is blocked and traffic cannot move.",
        (1, 4),
    ),
}


def _people(kind: str, seed: int, bounds: tuple[int, int] | None) -> int | None:
    if bounds is None:
        return None
    low, high = bounds
    # Deterministic, so a replayed scenario reports the same numbers.
    return low + (seed * 7919) % (high - low + 1)


class CallGenerator:
    """Produces the calls for a scenario run, once, up front.

    Generated ahead of time rather than as the clock ticks so the run is
    reproducible and can be scrubbed backwards, and so the whole timeline can
    be inspected before a demo instead of being discovered during one.
    """

    def __init__(self, model: FloodModel, places: list[Place]) -> None:
        self.model = model
        self.places = places

    def generate(self, duration_minutes: float = 180.0) -> list[GeneratedCall]:
        calls: list[GeneratedCall] = []
        interval = 60.0 / CALLS_PER_HOUR
        used: set[str] = set()

        minute = interval
        index = 0
        while minute <= duration_minutes:
            surface = self.model.surface_at(minute)

            # Candidates are places that are wet *now* and have not already
            # produced a call. Sorted by depth so the worst-hit place calls
            # first, which is what actually happens.
            candidates = [
                (place, self.model.depth_at(surface, place.lon, place.lat))
                for place in self.places
                if place.name not in used
            ]
            candidates = [
                (place, depth) for place, depth in candidates if depth >= MIN_CALL_DEPTH
            ]
            candidates.sort(key=lambda item: -item[1])

            if candidates:
                # Rotate through the top of the list rather than always taking
                # the deepest, so calls spread across the district instead of
                # stacking on one street corner.
                place, depth = candidates[index % min(len(candidates), 6)]
                used.add(place.name)

                kind = place.incident_kind
                template_az, template_en, bounds = TEMPLATES[kind]
                calls.append(
                    GeneratedCall(
                        place=place,
                        kind=IncidentKind(kind),
                        minute=round(minute, 1),
                        transcript_az=template_az.format(place=place.name, depth=depth),
                        transcript_en=template_en.format(place=place.name, depth=depth),
                        people_affected=_people(kind, index, bounds),
                        water_depth_m=depth,
                    )
                )
                index += 1

            minute += interval

        log.info("generated %d calls over %.0f minutes", len(calls), duration_minutes)
        return calls
