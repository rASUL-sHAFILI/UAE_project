"""A flood that follows the actual ground.

The model is the one used for first-pass flood risk mapping: raise a water
level, flood every cell below it, and require the water to be connected to a
body of water it could have come from. The last part is what separates it from
colouring in a contour — an inland dip that sits below the water level but has
higher ground all around it does not fill, because nothing can get in.

Everything here is a pure function of the water level, and the water level is a
function of the scenario minute, so the whole flood is reproducible and can be
scrubbed in either direction.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

import numpy as np

from .terrain import ElevationGrid

#: Cells at or below this height are treated as standing water at rest — the
#: lagoon, the creek and the sea. They are where a flood can spread from.
#:
#: Chosen from the terrain itself rather than picked: the DEM puts the open
#: water at a flat 0.00 m across three thousand cells and land starts above it.
#: A higher threshold masks the low coastal strip as sea, which is exactly the
#: ground the flood matters most on.
SEA_LEVEL = 0.05

#: Peak water level of the scenario, metres above datum.
PEAK_LEVEL = 2.4

#: Water below this depth is not reported. It is within the error of an 8-metre
#: DEM and reporting it would fill the map with noise.
MIN_REPORTED_DEPTH = 0.05


def water_level_at(minute: float, duration: float = 180.0) -> float:
    """Water level in metres above datum, at a scenario minute.

    A storm surge curve: nothing for the first few minutes, a steep rise as the
    rain peaks, then a long plateau. It does not recede inside the scenario —
    three hours is not long enough for a lagoon to drain, and pretending
    otherwise would make the hardest decisions look temporary.
    """
    if minute <= 0:
        return SEA_LEVEL

    progress = min(minute / duration, 1.0)
    # Logistic, centred a third of the way in, so the crisis develops while
    # there is still scenario left to respond in.
    shaped = 1.0 / (1.0 + math.exp(-9.0 * (progress - 0.34)))
    # Normalised so the curve starts at zero rather than at its value at t=0.
    baseline = 1.0 / (1.0 + math.exp(9.0 * 0.34))
    normalised = (shaped - baseline) / (1.0 - baseline)

    return SEA_LEVEL + normalised * (PEAK_LEVEL - SEA_LEVEL)


@dataclass(frozen=True)
class FloodSurface:
    """Depth of standing water over a grid, in metres. Zero where dry."""

    depth: np.ndarray
    level: float
    grid: ElevationGrid

    @property
    def flooded_cells(self) -> int:
        return int(np.count_nonzero(self.depth >= MIN_REPORTED_DEPTH))

    @property
    def peak_depth(self) -> float:
        return float(self.depth.max()) if self.depth.size else 0.0


class FloodModel:
    """Holds the terrain and turns a water level into a flood surface."""

    def __init__(self, grid: ElevationGrid) -> None:
        self.grid = grid
        self._sea_mask = grid.heights <= SEA_LEVEL
        self._cell_area_m2 = _cell_area(grid)

        if not self._sea_mask.any():
            raise ValueError(
                "No cells at or below sea level in the loaded terrain — the "
                "flood has nowhere to spread from. Check the bounding box."
            )

    def surface_at(self, minute: float) -> FloodSurface:
        return self.surface_for_level(water_level_at(minute))

    def surface_for_level(self, level: float) -> FloodSurface:
        """Flood every cell below `level` that water can actually reach.

        A breadth-first fill from the open water. Numpy would give the same
        answer without the connectivity rule in one line; the queue is the
        whole point.
        """
        heights = self.grid.heights
        rows, cols = heights.shape

        below = heights < level
        reached = np.zeros_like(below, dtype=bool)

        queue: deque[tuple[int, int]] = deque()
        seeds = np.argwhere(self._sea_mask & below)
        for row, col in seeds:
            reached[row, col] = True
            queue.append((int(row), int(col)))

        while queue:
            row, col = queue.popleft()
            for delta_row, delta_col in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row, next_col = row + delta_row, col + delta_col
                if not (0 <= next_row < rows and 0 <= next_col < cols):
                    continue
                if reached[next_row, next_col] or not below[next_row, next_col]:
                    continue
                reached[next_row, next_col] = True
                queue.append((next_row, next_col))

        # Only ground that is normally dry counts as flooded. The lagoon and the
        # creek are already water; reporting their depth would put a
        # twenty-seven metre reading on the map from the lagoon bed and drown
        # the numbers a dispatcher actually needs.
        depth = np.where(reached & ~self._sea_mask, level - heights, 0.0)
        depth = np.clip(depth, 0.0, None)

        return FloodSurface(depth=depth, level=level, grid=self.grid)

    def flooded_area_m2(self, surface: FloodSurface) -> float:
        return surface.flooded_cells * self._cell_area_m2

    def depth_at(self, surface: FloodSurface, lon: float, lat: float) -> float:
        """Standing water at one coordinate. Zero outside the modelled area."""
        index = self.grid.index_of(lon, lat)
        if index is None:
            return 0.0
        return float(surface.depth[index])

    def wet_cells(
        self, surface: FloodSurface, minimum: float = MIN_REPORTED_DEPTH
    ) -> list[tuple[float, float, float, float]]:
        """Every cell with water, as (lon, lat, depth, elevation).

        This is what goes into the database and, from there, onto the map.
        """
        wet = np.argwhere(surface.depth >= minimum)
        out: list[tuple[float, float, float, float]] = []
        for row, col in wet:
            lon, lat = self.grid.cell_centre(int(row), int(col))
            out.append(
                (
                    lon,
                    lat,
                    float(surface.depth[row, col]),
                    float(self.grid.heights[row, col]),
                )
            )
        return out


def _cell_area(grid: ElevationGrid) -> float:
    """Ground area of one grid cell in square metres."""
    rows, cols = grid.heights.shape
    mid_lat = (grid.north + grid.south) / 2.0
    metres_per_degree_lat = 110_574.0
    metres_per_degree_lon = 111_320.0 * math.cos(math.radians(mid_lat))

    height_m = (grid.north - grid.south) / rows * metres_per_degree_lat
    width_m = (grid.east - grid.west) / cols * metres_per_degree_lon
    return height_m * width_m
