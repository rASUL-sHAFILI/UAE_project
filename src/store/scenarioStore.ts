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
