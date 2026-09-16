/**
 * Synthetic flood scenario for Al-Majaz.
 *
 * This stands in for the IoT and detection feeds until the generator and the
 * YOLOv8 pipeline land. It emits exactly the shapes the real feeds will —
 * `FloodReading` points and depth-tagged extents — so the layers that consume
 * it will not need changing when the source is swapped for a WebSocket.
 *
 * Everything here is a pure function of the scenario minute. Nothing is
 * stateful and nothing calls `Math.random` at read time, so scrubbing the
 * timeline backwards shows exactly what it showed on the way forward.
 */

import {
  PEAK_WATER_DEPTH,
  SCENARIO_DURATION_MINUTES,
  SCENARIO_START,
  WATER_HEIGHT_EXAGGERATION,
} from '../config/scenario'
import { clamp, offsetMetres, organicRing, seededRandom } from '../lib/geo'
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'

import type { Coordinates, FloodReading } from '../types'

interface FloodSource {
  id: string
  /** Where the water first pools. */
  center: Coordinates
  /** Scenario minute at which water first appears here. */
  onsetMinute: number
  /** Minutes from onset to full extent. */
  riseMinutes: number
  /** Radius of the flooded area once fully developed, in metres. */
  maxRadiusMetres: number
  /** Depth at the centre once fully developed, in metres. */
  maxDepthMetres: number
  /** Human-readable label used in the incident feed. */
  label: string
  /** Seed for this source's extent outline, so its shape never changes. */
  shapeSeed: number
}

/**
 * Five low-lying points around Khalid Lagoon. The ordering of onsets is the
 * story the demo tells: the waterfront goes first, the corniche follows, and
 * the inland junctions flood last, by which time the agents have already had
 * to make their hardest routing decision.
 */
export const FLOOD_SOURCES: FloodSource[] = [
  {
    id: 'waterfront',
    center: [55.3772, 25.3238],
    onsetMinute: 0,
    riseMinutes: 55,
    maxRadiusMetres: 420,
    maxDepthMetres: PEAK_WATER_DEPTH,
    label: 'Al Majaz Waterfront',
    shapeSeed: 101,
  },
  {
    id: 'corniche',
    center: [55.3841, 25.3268],
    onsetMinute: 18,
    riseMinutes: 60,
    maxRadiusMetres: 360,
    maxDepthMetres: 1.5,
    label: 'Buhaira Corniche',
    shapeSeed: 227,
  },
  {
    id: 'qasimia',
    center: [55.3858, 25.3322],
    onsetMinute: 42,
    riseMinutes: 70,
    maxRadiusMetres: 300,
    maxDepthMetres: 1.1,
    label: 'Al Qasimia',
    shapeSeed: 359,
  },
  {
    id: 'khalidiya',
    center: [55.3756, 25.3305],
    onsetMinute: 64,
    riseMinutes: 65,
    maxRadiusMetres: 330,
    maxDepthMetres: 1.25,
    label: 'Al Khalidiya',
    shapeSeed: 487,
  },
  {
    id: 'majaz-three',
    center: [55.3812, 25.3182],
    onsetMinute: 88,
    riseMinutes: 60,
    maxRadiusMetres: 280,
    maxDepthMetres: 0.95,
    label: 'Al Majaz 3',
    shapeSeed: 613,
  },
]

/** Sensor positions are fixed for the whole run; only their readings change. */
const SENSORS_PER_SOURCE = 44

interface Sensor {
  sourceId: string
  location: Coordinates
  /** Distance from the source centre, cached so depth is cheap to compute. */
  distanceMetres: number
}

const SENSORS: Sensor[] = FLOOD_SOURCES.flatMap((source, sourceIndex) => {
  const random = seededRandom(0x5ea1 + sourceIndex * 977)
  return Array.from({ length: SENSORS_PER_SOURCE }, (): Sensor => {
    // Square-rooting the random radius spreads sensors evenly over the disc
    // instead of bunching them at the centre.
    const distance = Math.sqrt(random()) * source.maxRadiusMetres
    const angle = random() * Math.PI * 2
    return {
      sourceId: source.id,
      location: offsetMetres(
        source.center,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
      ),
      distanceMetres: distance,
    }
  })
})

/**
 * How far a source has developed at a given minute, from 0 to 1.
 *
 * Water rises fast and drains slowly, so this is a smooth ramp that plateaus
 * rather than a triangle — by the end of the scenario nothing has receded.
 */
function sourceProgress(source: FloodSource, minute: number): number {
  const elapsed = minute - source.onsetMinute
  if (elapsed <= 0) return 0
  const raw = clamp(elapsed / source.riseMinutes, 0, 1)
  // Ease-out: the first centimetres arrive quickly, the last ones crawl.
  return 1 - (1 - raw) ** 2
}

/** Depth in metres at one sensor, at one moment. */
function depthAt(sensor: Sensor, source: FloodSource, minute: number): number {
  const progress = sourceProgress(source, minute)
  if (progress === 0) return 0

  const reach = source.maxRadiusMetres * progress
  if (sensor.distanceMetres > reach) return 0

  // Depth falls off towards the edge of the flooded area.
  const falloff = 1 - sensor.distanceMetres / reach
  return source.maxDepthMetres * progress * falloff ** 1.4
}

const SOURCES_BY_ID = new Map(FLOOD_SOURCES.map((source) => [source.id, source]))

/** Wall-clock time for a scenario minute. */
export function scenarioTime(minute: number): Date {
  return new Date(SCENARIO_START.getTime() + minute * 60_000)
}

/**
 * Every sensor currently reporting standing water.
 *
 * Dry sensors are omitted rather than reported as zero, which matches how a
 * real feed behaves and keeps the heatmap from weighting empty ground.
 */
export function floodReadingsAt(minute: number): FloodReading[] {
  const measuredAt = scenarioTime(minute).toISOString()
  const readings: FloodReading[] = []

  for (const sensor of SENSORS) {
    const source = SOURCES_BY_ID.get(sensor.sourceId)
    if (!source) continue
    const depth = depthAt(sensor, source, minute)
    if (depth < 0.05) continue
    readings.push({ location: sensor.location, depth, measuredAt })
  }

  return readings
}

/** The flood readings as a GeoJSON point collection, ready for a heatmap source. */
export function floodReadingsGeoJSON(minute: number): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: floodReadingsAt(minute).map((reading) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: reading.location },
      properties: { depth: reading.depth },
    })),
  }
}

/**
 * The flooded area as polygons, one per source, tagged with the depth at its
 * centre. The water-surface layer extrudes these to that depth.
 */
export function floodExtentGeoJSON(minute: number): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []

  for (const source of FLOOD_SOURCES) {
    const progress = sourceProgress(source, minute)
    if (progress === 0) continue

    const depth = source.maxDepthMetres * progress

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          organicRing(source.center, source.maxRadiusMetres * progress, source.shapeSeed),
        ],
      },
      properties: {
        sourceId: source.id,
        label: source.label,
        // The true depth, used for colour, the readouts and routing.
        depth,
        // The same depth stretched for legibility; only the geometry uses it.
        renderHeight: depth * WATER_HEIGHT_EXAGGERATION,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

/** Deepest standing water anywhere in the district, in metres. */
export function peakDepthAt(minute: number): number {
  return FLOOD_SOURCES.reduce(
    (peak, source) => Math.max(peak, source.maxDepthMetres * sourceProgress(source, minute)),
    0,
  )
}

/** Rough count of flooded street-level area, in square metres. */
export function floodedAreaAt(minute: number): number {
  return FLOOD_SOURCES.reduce((total, source) => {
    const radius = source.maxRadiusMetres * sourceProgress(source, minute)
    return total + Math.PI * radius ** 2
  }, 0)
}

/** Sources that have started flooding by this minute, worst first. */
export function activeSourcesAt(minute: number) {
  return FLOOD_SOURCES.map((source) => ({
    ...source,
    depth: source.maxDepthMetres * sourceProgress(source, minute),
    radiusMetres: source.maxRadiusMetres * sourceProgress(source, minute),
  }))
    .filter((source) => source.depth > 0.05)
    .sort((a, b) => b.depth - a.depth)
}

/** Guard so the timeline UI and the data agree on the last minute. */
export const LAST_MINUTE = SCENARIO_DURATION_MINUTES
