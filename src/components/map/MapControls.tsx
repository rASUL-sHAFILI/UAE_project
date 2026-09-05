import { INITIAL_VIEW, type LightPreset } from '../../config/map'
import { useMapStore } from '../../store/mapStore'

const PRESETS: { value: LightPreset; label: string }[] = [
  { value: 'dawn', label: 'Səhər' },
  { value: 'day', label: 'Gündüz' },
  { value: 'dusk', label: 'Qürub' },
  { value: 'night', label: 'Gecə' },
]

/**
 * Demo-time camera and lighting controls. Kept separate from the map itself so
 * the presenter can drive the scene without touching the scenario timeline.
 */
export function MapControls() {
  const map = useMapStore((s) => s.map)
  const isReady = useMapStore((s) => s.isReady)
  const lightPreset = useMapStore((s) => s.lightPreset)
  const setLightPreset = useMapStore((s) => s.setLightPreset)

  if (!isReady) return null

  return (
    <div className="map-controls">
      <div className="map-controls__group" role="group" aria-label="İşıqlandırma">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={preset.value === lightPreset ? 'is-active' : undefined}
            onClick={() => setLightPreset(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="map-controls__reset"
        onClick={() => map?.flyTo({ ...INITIAL_VIEW, duration: 1600, essential: true })}
      >
        Al-Majaz görünüşünə qayıt
      </button>
    </div>
  )
}
