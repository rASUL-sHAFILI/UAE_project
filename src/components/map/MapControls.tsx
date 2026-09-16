import { INITIAL_VIEW, type LightPreset } from '../../config/map'
import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import { useMapStore } from '../../store/mapStore'

const PRESETS: { value: LightPreset; label: TranslationKey }[] = [
  { value: 'dawn', label: 'map.light.dawn' },
  { value: 'day', label: 'map.light.day' },
  { value: 'dusk', label: 'map.light.dusk' },
  { value: 'night', label: 'map.light.night' },
]

/**
 * Demo-time camera and lighting controls. Kept separate from the map itself so
 * the presenter can drive the scene without touching the scenario timeline.
 */
export function MapControls() {
  const { t } = useTranslation()
  const map = useMapStore((s) => s.map)
  const isReady = useMapStore((s) => s.isReady)
  const lightPreset = useMapStore((s) => s.lightPreset)
  const setLightPreset = useMapStore((s) => s.setLightPreset)

  if (!isReady) return null

  return (
    <div className="map-controls">
      <div className="map-controls__group" role="group" aria-label={t('map.lighting')}>
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={preset.value === lightPreset ? 'is-active' : undefined}
            onClick={() => setLightPreset(preset.value)}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="map-controls__reset"
        onClick={() => map?.flyTo({ ...INITIAL_VIEW, duration: 1600, essential: true })}
      >
        {t('map.resetView')}
      </button>
    </div>
  )
}
