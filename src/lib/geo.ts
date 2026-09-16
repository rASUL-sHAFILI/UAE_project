import type { Coordinates } from '../types'

/** Metres per degree of latitude. Constant enough anywhere on Earth. */
const METRES_PER_DEGREE_LAT = 111_320

/**
 * Metres per degree of longitude shrink towards the poles. Sharjah sits at
 * about 25.3°N, so a degree of longitude is roughly 90% of a degree of
 * latitude here.
 */
function metresPerDegreeLng(latitude: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180)
}

/** Offset a coordinate by a distance in metres along each axis. */
export function offsetMetres(
  [lng, lat]: Coordinates,
  eastMetres: number,
  northMetres: number,
): Coordinates {
  return [lng + eastMetres / metresPerDegreeLng(lat), lat + northMetres / METRES_PER_DEGREE_LAT]
}

/** Great-circle-ish distance in metres. Flat-earth is fine across one district. */
export function distanceMetres([lng1, lat1]: Coordinates, [lng2, lat2]: Coordinates): number {
  const dx = (lng2 - lng1) * metresPerDegreeLng((lat1 + lat2) / 2)
  const dy = (lat2 - lat1) * METRES_PER_DEGREE_LAT
  return Math.hypot(dx, dy)
}

/**
 * A closed ring approximating a circle of `radiusMetres` around `center`.
 *
 * Used for flood extents. Turf would do this too, but a single function is
 * cheaper than a dependency when this is the only geometry we generate.
 */
export function circleRing(
  center: Coordinates,
  radiusMetres: number,
  steps = 48,
): Coordinates[] {
  const ring: Coordinates[] = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    ring.push(
      offsetMetres(center, Math.cos(angle) * radiusMetres, Math.sin(angle) * radiusMetres),
    )
  }
  return ring
}

/**
 * A closed ring whose radius wanders, so a flood extent reads as water finding
 * the low ground rather than as a compass circle.
 *
 * The wobble is the sum of three harmonics with seeded phases: deterministic,
 * smooth, and closed at both ends because every harmonic completes a whole
 * number of cycles around the ring.
 */
export function organicRing(
  center: Coordinates,
  radiusMetres: number,
  seed: number,
  steps = 72,
): Coordinates[] {
  const random = seededRandom(seed)
  const harmonics = [3, 5, 8].map((frequency) => ({
    frequency,
    phase: random() * Math.PI * 2,
    amplitude: (0.16 / frequency) * (0.6 + random() * 0.8),
  }))

  const ring: Coordinates[] = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const wobble = harmonics.reduce(
      (total, h) => total + h.amplitude * Math.sin(h.frequency * angle + h.phase),
      0,
    )
    const radius = radiusMetres * (1 + wobble)
    ring.push(offsetMetres(center, Math.cos(angle) * radius, Math.sin(angle) * radius))
  }
  return ring
}

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The scenario must look the same in rehearsal and on stage, so every random
 * choice in the mock data is seeded rather than drawn from `Math.random`.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Clamp a number into a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
