import { useEffect } from 'react'

import { useScenarioStore } from '../store/scenarioStore'

/**
 * Drives the scenario clock from the browser's animation frames.
 *
 * Mounted once, near the root. Using rAF rather than an interval keeps the
 * clock in step with what the map actually paints, and pauses it for free when
 * the tab is in the background — a demo left open on a second screen does not
 * quietly run to the end.
 */
export function useScenarioClock() {
  const isPlaying = useScenarioStore((state) => state.isPlaying)
  const advance = useScenarioStore((state) => state.advance)

  useEffect(() => {
    if (!isPlaying) return

    let frame = 0
    let previous = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = (now - previous) / 1000
      previous = now
      advance(deltaSeconds)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, advance])
}
