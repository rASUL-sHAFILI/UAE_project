import { PLAYBACK_SPEEDS, SCENARIO_DURATION_MINUTES } from '../../config/scenario'
import { floodedAreaAt, peakDepthAt, scenarioTime } from '../../data/floodScenario'
import { useScenarioStore } from '../../store/scenarioStore'

const TIME_FORMAT = new Intl.DateTimeFormat('az-AZ', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Dubai',
})

function formatElapsed(minute: number): string {
  const hours = Math.floor(minute / 60)
  const minutes = Math.floor(minute % 60)
  return `T+${hours}s ${String(minutes).padStart(2, '0')}d`
}

/**
 * Transport controls for the flood scenario.
 *
 * The presenter drives the whole demo from here: the timeline is scrubbable so
 * a question about "what did it look like before the corniche went" can be
 * answered by dragging back, rather than restarting the run.
 */
export function ScenarioClock() {
  const minute = useScenarioStore((state) => state.minute)
  const isPlaying = useScenarioStore((state) => state.isPlaying)
  const speed = useScenarioStore((state) => state.speed)
  const toggle = useScenarioStore((state) => state.toggle)
  const reset = useScenarioStore((state) => state.reset)
  const setMinute = useScenarioStore((state) => state.setMinute)
  const setSpeed = useScenarioStore((state) => state.setSpeed)

  const peakDepth = peakDepthAt(minute)
  const floodedHectares = floodedAreaAt(minute) / 10_000

  return (
    <div className="clock">
      <div className="clock__row">
        <button
          type="button"
          className="clock__play"
          onClick={toggle}
          aria-label={isPlaying ? 'Dayandır' : 'Oynat'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="clock__time">
          <strong>{TIME_FORMAT.format(scenarioTime(minute))}</strong>
          <span>{formatElapsed(minute)}</span>
        </div>

        <input
          className="clock__scrub"
          type="range"
          min={0}
          max={SCENARIO_DURATION_MINUTES}
          step={1}
          value={Math.round(minute)}
          onChange={(event) => setMinute(Number(event.target.value))}
          aria-label="Ssenari vaxtı"
        />

        <div className="clock__speeds" role="group" aria-label="Sürət">
          {PLAYBACK_SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === speed ? 'is-active' : undefined}
              onClick={() => setSpeed(option)}
            >
              {option}x
            </button>
          ))}
        </div>

        <button type="button" className="clock__reset" onClick={reset}>
          Sıfırla
        </button>
      </div>

      <div className="clock__stats">
        <span>
          Ən dərin su <strong>{peakDepth.toFixed(2)} m</strong>
        </span>
        <span>
          Su altında <strong>{floodedHectares.toFixed(1)} ha</strong>
        </span>
      </div>
    </div>
  )
}
