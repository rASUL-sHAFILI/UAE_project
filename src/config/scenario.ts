/**
 * Timing and physical constants for the flood scenario.
 *
 * The pitch is ten minutes and the live demo inside it is four, so the
 * scenario is written to be watchable in well under that: three simulated
 * hours that play back in about ninety seconds, leaving room to stop and
 * talk over it.
 */

/** Simulated length of the scenario, in minutes from the first alert. */
export const SCENARIO_DURATION_MINUTES = 180

/** Simulated minutes advanced per real second at 1x playback. */
export const MINUTES_PER_SECOND = 2

/** Playback speeds offered to the presenter. */
export const PLAYBACK_SPEEDS = [1, 2, 4] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

/** Peak water depth at the worst-hit point, in metres. */
export const PEAK_WATER_DEPTH = 1.9

/**
 * Wall-clock time the scenario starts from. Fixed rather than derived from
 * `Date.now()` so that the timestamps on screen are identical in every run —
 * a demo that reads differently each rehearsal is a demo that surprises you
 * on stage.
 */
export const SCENARIO_START = new Date('2026-08-14T16:20:00+04:00')

/**
 * Depth at which a street is treated as impassable by road vehicles. Ambulances
 * and fire trucks lose traction well before a boat would, and the route planner
 * in week 5-6 uses this same number.
 */
export const IMPASSABLE_DEPTH = 0.45

/**
 * Vertical exaggeration applied to the rendered water surface.
 *
 * Two metres of water spread over a four-hundred-metre pool is, to scale, a
 * film — from a pitched camera it reads as a flat coloured disc and the rise
 * over time is invisible. Multiplying the rendered height makes the scenario
 * legible without touching the numbers: every depth shown in the UI and used
 * for routing decisions is the true one, and only the geometry is stretched.
 */
export const WATER_HEIGHT_EXAGGERATION = 8
