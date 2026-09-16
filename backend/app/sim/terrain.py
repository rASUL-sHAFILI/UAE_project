"""Real ground elevation for Al-Majaz, from Mapbox Terrain-RGB.

This replaces the circles the first version of the flood used. Water does not
spread in discs; it runs downhill and pools where the ground is low, and the
only way to show that honestly is to use the actual ground.

Terrain-RGB encodes height in the pixel channels of an ordinary PNG:

    metres = -10000 + (R * 65536 + G * 256 + B) * 0.1

Tiles are fetched once and cached on disk. After the first run the model needs
no network at all, which matters more than it sounds: a demo that depends on
conference wifi is a demo that fails on stage.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
from PIL import Image

from ..config import get_settings

log = logging.getLogger(__name__)

#: The area the scenario covers, as (west, south, east, north).
AL_MAJAZ_BBOX = (55.345, 25.300, 55.420, 25.360)

#: Zoom 14 gives roughly 8.6 m per pixel at this latitude — fine enough to tell
#: a corniche from the car park beside it, coarse enough to stay a few tiles.
TERRAIN_ZOOM = 14

#: The flood model runs on the DEM downsampled by this factor, giving roughly
#: 34-metre cells. Coarser than that and a 50-metre cell straddling a corniche
#: and the lagoon beside it averages to water, so the road it is meant to warn
#: about disappears into the sea mask.
MODEL_DOWNSAMPLE = 8

def _lon_to_tile_x(lon: float, zoom: int) -> float:
    return (lon + 180.0) / 360.0 * (2**zoom)


def _lat_to_tile_y(lat: float, zoom: int) -> float:
    radians = math.radians(lat)
    return (
        (1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0 * (2**zoom)
    )


def _tile_x_to_lon(x: float, zoom: int) -> float:
    return x / (2**zoom) * 360.0 - 180.0


def _tile_y_to_lat(y: float, zoom: int) -> float:
    n = math.pi * (1 - 2 * y / (2**zoom))
    return math.degrees(math.atan(math.sinh(n)))


@dataclass(frozen=True)
class ElevationGrid:
    """A rectangle of ground heights, in metres, on a regular lon/lat grid."""

    heights: np.ndarray  # shape (rows, cols)
    west: float
    south: float
    east: float
    north: float

    @property
    def shape(self) -> tuple[int, int]:
        return self.heights.shape

    def cell_centre(self, row: int, col: int) -> tuple[float, float]:
        """Longitude and latitude at the centre of one cell."""
        rows, cols = self.heights.shape
        lon = self.west + (col + 0.5) / cols * (self.east - self.west)
        # Row zero is the north edge: image rows run downwards.
        lat = self.north - (row + 0.5) / rows * (self.north - self.south)
        return lon, lat

    def index_of(self, lon: float, lat: float) -> tuple[int, int] | None:
        """Grid cell containing a coordinate, or None if it is outside."""
        if not (self.west <= lon <= self.east and self.south <= lat <= self.north):
            return None
        rows, cols = self.heights.shape
        col = int((lon - self.west) / (self.east - self.west) * cols)
        row = int((self.north - lat) / (self.north - self.south) * rows)
        return min(row, rows - 1), min(col, cols - 1)

    def elevation_at(self, lon: float, lat: float) -> float | None:
        index = self.index_of(lon, lat)
        if index is None:
            return None
        return float(self.heights[index])


def _cache_path(zoom: int, x: int, y: int) -> Path:
    directory = Path(get_settings().terrain_cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"terrain-{zoom}-{x}-{y}.png"


async def _fetch_tile(client: httpx.AsyncClient, zoom: int, x: int, y: int) -> bytes:
    """One Terrain-RGB tile, from disk if it has been fetched before."""
    cached = _cache_path(zoom, x, y)
    if cached.exists():
        return cached.read_bytes()

    token = get_settings().mapbox_token
    if not token:
        raise RuntimeError(
            "MAPBOX_TOKEN is not set, and no cached terrain tiles are present. "
            "The flood model needs real elevation data to run."
        )

    url = (
        f"https://api.mapbox.com/v4/mapbox.terrain-rgb/{zoom}/{x}/{y}@2x.pngraw"
        f"?access_token={token}"
    )
    response = await client.get(url, timeout=30.0)
    response.raise_for_status()

    cached.write_bytes(response.content)
    log.info("cached terrain tile %s/%s/%s", zoom, x, y)
    return response.content


def _decode(tile: bytes) -> np.ndarray:
    image = Image.open(BytesIO(tile)).convert("RGB")
    pixels = np.asarray(image, dtype=np.float64)
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    return -10000.0 + (red * 65536.0 + green * 256.0 + blue) * 0.1


async def load_elevation(
    bbox: tuple[float, float, float, float] = AL_MAJAZ_BBOX,
    zoom: int = TERRAIN_ZOOM,
) -> ElevationGrid:
    """Fetch and stitch the tiles covering `bbox` into one elevation grid."""
    west, south, east, north = bbox

    x_min = int(math.floor(_lon_to_tile_x(west, zoom)))
    x_max = int(math.floor(_lon_to_tile_x(east, zoom)))
    y_min = int(math.floor(_lat_to_tile_y(north, zoom)))
    y_max = int(math.floor(_lat_to_tile_y(south, zoom)))

    async with httpx.AsyncClient() as client:
        rows = []
        for y in range(y_min, y_max + 1):
            columns = []
            for x in range(x_min, x_max + 1):
                columns.append(_decode(await _fetch_tile(client, zoom, x, y)))
            rows.append(np.hstack(columns))

    stitched = np.vstack(rows)

    # The stitched image covers whole tiles, which overhang the requested box.
    # Report the bounds that were actually loaded rather than the ones asked
    # for, so callers index into it correctly.
    return ElevationGrid(
        heights=stitched,
        west=_tile_x_to_lon(x_min, zoom),
        east=_tile_x_to_lon(x_max + 1, zoom),
        north=_tile_y_to_lat(y_min, zoom),
        south=_tile_y_to_lat(y_max + 1, zoom),
    )


def crop(grid: ElevationGrid, bbox: tuple[float, float, float, float]) -> ElevationGrid:
    """Trim a grid down to the area of interest."""
    west, south, east, north = bbox
    top_left = grid.index_of(west, north)
    bottom_right = grid.index_of(east, south)
    if top_left is None or bottom_right is None:
        return grid

    row0, col0 = top_left
    row1, col1 = bottom_right
    rows, cols = grid.heights.shape

    # Report the bounds of the cells that were actually kept, not the ones that
    # were asked for. They differ by up to one cell, and a grid that overstates
    # its extent maps every later coordinate to the wrong cell.
    lon_step = (grid.east - grid.west) / cols
    lat_step = (grid.north - grid.south) / rows

    return ElevationGrid(
        heights=grid.heights[row0 : row1 + 1, col0 : col1 + 1],
        west=grid.west + col0 * lon_step,
        east=grid.west + (col1 + 1) * lon_step,
        north=grid.north - row0 * lat_step,
        south=grid.north - (row1 + 1) * lat_step,
    )


def downsample(grid: ElevationGrid, factor: int) -> ElevationGrid:
    """Average the grid down by an integer factor.

    The flood model runs on a coarser grid than the DEM provides. At 8.6 m a
    pixel the full grid is far more detail than a dispatcher can act on, and
    every cell costs time in the flood fill and a row in the database.
    """
    if factor <= 1:
        return grid

    rows, cols = grid.heights.shape
    kept_rows = rows - rows % factor
    kept_cols = cols - cols % factor
    trimmed = grid.heights[:kept_rows, :kept_cols]
    reshaped = trimmed.reshape(kept_rows // factor, factor, kept_cols // factor, factor)

    # Trimming the remainder shrinks the ground the grid covers. Leaving the
    # bounds untouched would stretch the remaining cells over the full extent
    # and shift every lookup by up to one original cell.
    lon_step = (grid.east - grid.west) / cols
    lat_step = (grid.north - grid.south) / rows

    return ElevationGrid(
        heights=reshaped.mean(axis=(1, 3)),
        west=grid.west,
        east=grid.west + kept_cols * lon_step,
        north=grid.north,
        south=grid.north - kept_rows * lat_step,
    )
