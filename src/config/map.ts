/**
 * Al-Majaz (Sharjah, UAE) base map configuration.
 *
 * Every hard-coded geographic constant for the demo lives here so that the
 * scenario can be re-centred on another district without touching components.
 */

import type { LngLatBoundsLike, LngLatLike } from 'mapbox-gl'

/** Mapbox public access token, injected at build time from `.env.local`. */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

/** Al-Majaz Waterfront / Khalid Lagoon — the centre of the demo scenario. */
export const AL_MAJAZ_CENTER: LngLatLike = [55.3792, 25.3275]

/**
 * Camera the map opens with. A high pitch is intentional: the flood heatmap
 * and the water-level rise effect (week 3-4) only read as 3D from a low angle.
 */
export const INITIAL_VIEW = {
  center: AL_MAJAZ_CENTER,
  zoom: 15.2,
  pitch: 62,
  bearing: -24,
} as const

/**
 * The camera is fenced to the Al-Majaz district. During a 4-minute live demo
 * an accidental pan to the middle of the Gulf costs more than it is worth.
 *
 * The box is deliberately wider than the area of interest: at a 62-degree
 * pitch the camera sees a long way past its centre, and bounds drawn tightly
 * around the waterfront make Mapbox shove the centre south to keep the view
 * inside them — the map would open somewhere other than where INITIAL_VIEW
 * asks for.
 */
export const AL_MAJAZ_BOUNDS: LngLatBoundsLike = [
  [55.33, 25.28], // south-west
  [55.43, 25.375], // north-east
]

export const MIN_ZOOM = 13
export const MAX_ZOOM = 19

/**
 * Mapbox Standard ships 3D buildings, landmarks and lighting presets out of
 * the box, so we do not have to hand-build a fill-extrusion layer.
 */
export const MAP_STYLE = 'mapbox://styles/mapbox/standard'

/** Standard's lighting presets. `dusk` reads best for an emergency scenario. */
export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night'
export const DEFAULT_LIGHT_PRESET: LightPreset = 'dusk'

/**
 * Standard exposes three insertion slots. Custom layers must declare one,
 * otherwise they are drawn on top of every label in the basemap.
 *
 * - `bottom`  — below roads and buildings (flood polygons, water rise)
 * - `middle`  — below labels, above roads (heatmaps, incident zones)
 * - `top`     — above everything (rescue units, markers, routes)
 */
export const SLOTS = {
  flood: 'bottom',
  heatmap: 'middle',
  units: 'top',
} as const

/** Exaggeration applied to the DEM source. Sharjah is flat; 1.0 is honest. */
export const TERRAIN_EXAGGERATION = 1.0
