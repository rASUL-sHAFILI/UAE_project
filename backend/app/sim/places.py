"""Real places in Al-Majaz, from Mapbox Streets.

Emergency calls have to come from somewhere, and coordinates invented to suit a
story are the fastest way to lose an audience that knows the city. These are
actual points of interest — the shops, clinics, schools and car parks that are
really there — pulled from the Mapbox Streets tileset with Tilequery.

Results are cached on disk with the terrain tiles, for the same reason: after
the first run the scenario needs no network.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

TILEQUERY_URL = "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery"

#: Category names that decide what kind of call a place produces. Matched on
#: the human-readable category rather than the broad class: "commercial
#: services" covers both an electrical contractor and a taxi rank, and only one
#: of those plausibly catches fire.
MEDICAL_CATEGORIES = ("pharmacy", "clinic", "hospital", "doctor", "dentist", "medical")
FIRE_CATEGORIES = ("electric", "hardware", "garage", "car repair", "industrial", "factory")
VEHICLE_CATEGORIES = ("parking", "petrol", "fuel", "car wash", "car dealer")
OCCUPIED_CATEGORIES = (
    "hotel",
    "school",
    "mosque",
    "supermarket",
    "restaurant",
    "cafe",
    "mall",
    "shopping",
)


def kind_for(category: str, poi_class: str) -> str:
    """What sort of emergency this place plausibly reports during a flood."""
    text = f"{category} {poi_class}".lower()

    if any(word in text for word in MEDICAL_CATEGORIES):
        return "medical"
    if any(word in text for word in FIRE_CATEGORIES):
        return "fire"
    if any(word in text for word in VEHICLE_CATEGORIES):
        return "flood"
    if any(word in text for word in OCCUPIED_CATEGORIES):
        return "rescue"
    # A shop with people in it during a flood is a rescue; an unclassified
    # feature is water on the street and nothing more.
    return "rescue" if poi_class == "store_like" else "flood"


@dataclass(frozen=True)
class Place:
    name: str
    lon: float
    lat: float
    poi_class: str
    category: str

    @property
    def incident_kind(self) -> str:
        return kind_for(self.category, self.poi_class)


def _cache_file() -> Path:
    directory = Path(get_settings().terrain_cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / "places.json"


async def _query(
    client: httpx.AsyncClient, lon: float, lat: float, radius: int, limit: int
) -> list[Place]:
    token = get_settings().mapbox_token
    response = await client.get(
        f"{TILEQUERY_URL}/{lon},{lat}.json",
        params={
            "radius": radius,
            "limit": limit,
            "layers": "poi_label",
            "access_token": token,
        },
        timeout=20.0,
    )
    response.raise_for_status()

    places: list[Place] = []
    for feature in response.json().get("features", []):
        properties = feature.get("properties", {})
        name = properties.get("name")
        if not name:
            # Unnamed features exist in the tileset — a car park with no sign on
            # it. They make poor incident locations because nobody could report
            # a call from a place with no name.
            continue

        coordinates = feature["geometry"]["coordinates"]
        places.append(
            Place(
                name=str(name),
                lon=float(coordinates[0]),
                lat=float(coordinates[1]),
                poi_class=str(properties.get("class", "")),
                category=str(properties.get("category_en", "")),
            )
        )
    return places


async def load_places(
    samples: list[tuple[float, float]],
    *,
    radius: int = 400,
    per_sample: int = 20,
) -> list[Place]:
    """Named places near each sampled coordinate, de-duplicated."""
    cache = _cache_file()
    if cache.exists():
        raw = json.loads(cache.read_text(encoding="utf-8"))
        return [Place(**entry) for entry in raw]

    if not get_settings().mapbox_token:
        raise RuntimeError(
            "MAPBOX_TOKEN is not set and no place cache exists. The scenario "
            "needs real locations to put its calls at."
        )

    found: dict[tuple[float, float], Place] = {}
    async with httpx.AsyncClient() as client:
        for lon, lat in samples:
            try:
                for place in await _query(client, lon, lat, radius, per_sample):
                    found[(round(place.lon, 6), round(place.lat, 6))] = place
            except httpx.HTTPError as error:
                log.warning("tilequery failed at %s,%s: %s", lon, lat, error)

    places = list(found.values())
    cache.write_text(
        json.dumps([place.__dict__ for place in places], ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("cached %d named places", len(places))
    return places
