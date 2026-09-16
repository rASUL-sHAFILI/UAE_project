import { create } from 'zustand'

import {
  MINUTES_PER_SECOND,
  SCENARIO_DURATION_MINUTES,
  type PlaybackSpeed,
} from '../config/scenario'

interface ScenarioState {
  /** Minutes elapsed since the first alert. The single clock everything reads. */
  minute: number
  isPlaying: boolean
  speed: PlaybackSpeed
  play: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  setMinute: (minute: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
  /** Advance by a real-time delta in seconds. Called by the playback loop. */
  advance: (deltaSeconds: number) => void
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  minute: 0,
  isPlaying: false,
  speed: 1,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  reset: () => set({ minute: 0, isPlaying: false }),

  setMinute: (minute) =>
    set({ minute: Math.min(Math.max(minute, 0), SCENARIO_DURATION_MINUTES) }),

  setSpeed: (speed) => set({ speed }),

  advance: (deltaSeconds) => {
    const { minute, speed, isPlaying } = get()
    if (!isPlaying) return

    const next = minute + deltaSeconds * MINUTES_PER_SECOND * speed
    if (next >= SCENARIO_DURATION_MINUTES) {
      // Stop at the end rather than looping: the presenter wants the final
      // state on screen while they talk, not a scenario that restarts itself.
      set({ minute: SCENARIO_DURATION_MINUTES, isPlaying: false })
      return
    }
    set({ minute: next })
  },
}))

/**
 * Quantised views of the clock.
 *
 * The clock advances on every animation frame, which is what makes playback
 * smooth — but a selector that returns the raw minute re-renders its subscriber
 * sixty times a second, and most of what reads the clock does real work each
 * time: rebuilding two hundred GeoJSON features, re-sorting the incident list,
 * re-rendering twenty rows. Zustand only re-renders when the selected value
 * actually changes, so each consumer selects the coarsest value it can live
 * with and the expensive work runs at that rate instead.
 */

/** Whole simulated minutes. Everything that changes on a schedule uses this. */
export const selectWholeMinute = (state: { minute: number }) => Math.floor(state.minute)

/**
 * Eighths of a minute, for the handful of moving markers. Fine enough that
 * units glide rather than hop, coarse enough to cost a fraction of a frame.
 */
export const selectSmoothMinute = (state: { minute: number }) =>
  Math.round(state.minute * 8) / 8
