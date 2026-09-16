import { PLAYBACK_SPEEDS, SCENARIO_DURATION_MINUTES } from '../../config/scenario'
import { floodedAreaAt, peakDepthAt, scenarioTime } from '../../data/floodScenario'
import { useTranslation } from '../../i18n/useTranslation'
import { useScenarioStore } from '../../store/scenarioStore'

function formatElapsed(minute: number): string {
  const hours = Math.floor(minute / 60)
  const minutes = Math.floor(minute % 60)
  return `T+${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * Transport controls for the flood scenario.
 *
 * The presenter drives the whole demo from here: the timeline is scrubbable so
 * a question about "what did it look like before the corniche went" can be
 * answered by dragging back, rather than restarting the run.
 */
export function ScenarioClock() {
  const { t, locale } = useTranslation()
  const minute = useScenarioStore((state) => state.minute)
  const isPlaying = useScenarioStore((state) => state.isPlaying)
  const speed = useScenarioStore((state) => state.speed)
  const toggle = useScenarioStore((state) => state.toggle)
  const reset = useScenarioStore((state) => state.reset)
  const setMinute = useScenarioStore((state) => state.setMinute)
  const setSpeed = useScenarioStore((state) => state.setSpeed)

  const clockFormat = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  })

  const peakDepth = peakDepthAt(minute)
  const floodedHectares = floodedAreaAt(minute) / 10_000

  return (
    <div className="clock">
      <div className="clock__row">
        <button
          type="button"
          className="clock__play"
          onClick={toggle}
          aria-label={isPlaying ? t('clock.pause') : t('clock.play')}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="clock__time">
          <strong>{clockFormat.format(scenarioTime(minute))}</strong>
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
          aria-label={t('clock.timeline')}
        />

        <div className="clock__speeds" role="group" aria-label={t('clock.speed')}>
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
          {t('clock.reset')}
        </button>
      </div>

      <div className="clock__stats">
        <span>
          {t('clock.peakDepth')} <strong>{peakDepth.toFixed(2)} m</strong>
        </span>
        <span>
          {t('clock.floodedArea')} <strong>{floodedHectares.toFixed(1)} ha</strong>
        </span>
      </div>
    </div>
  )
}
