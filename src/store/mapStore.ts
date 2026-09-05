import { create } from 'zustand'
import type { Map as MapboxMap } from 'mapbox-gl'
import { DEFAULT_LIGHT_PRESET, type LightPreset } from '../config/map'

interface MapState {
  /**
   * The live Mapbox instance. Held outside React state on purpose — it is a
   * mutable handle, not a value, so nothing should re-render when it changes.
   */
  map: MapboxMap | null
  /** True once the style has finished loading and layers may be added. */
  isReady: boolean
  lightPreset: LightPreset
  setMap: (map: MapboxMap | null) => void
  setReady: (isReady: boolean) => void
  setLightPreset: (preset: LightPreset) => void
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  isReady: false,
  lightPreset: DEFAULT_LIGHT_PRESET,
  setMap: (map) => set({ map }),
  setReady: (isReady) => set({ isReady }),
  setLightPreset: (preset) => {
    const { map } = get()
    map?.setConfigProperty('basemap', 'lightPreset', preset)
    set({ lightPreset: preset })
  },
}))
