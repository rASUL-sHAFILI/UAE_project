import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import {
  AL_MAJAZ_BOUNDS,
  DEFAULT_LIGHT_PRESET,
  INITIAL_VIEW,
  MAPBOX_TOKEN,
  MAP_STYLE,
  MAX_ZOOM,
  MIN_ZOOM,
  TERRAIN_EXAGGERATION,
} from '../../config/map'
import { useMapStore } from '../../store/mapStore'
import { MissingTokenNotice } from './MissingTokenNotice'

mapboxgl.accessToken = MAPBOX_TOKEN

/**
 * The 3D Al-Majaz base map every other layer is drawn onto.
 *
 * Owns the Mapbox instance for the lifetime of the app and publishes it to the
 * store once the style is loaded. Feature layers (heatmap, flood surface,
 * rescue units) subscribe to that handle rather than creating their own map.
 */
export function BaseMap() {
  const container = useRef<HTMLDivElement>(null)
  const setMap = useMapStore((s) => s.setMap)
  const setReady = useMapStore((s) => s.setReady)

  useEffect(() => {
    if (!container.current || !MAPBOX_TOKEN) return

    const map = new mapboxgl.Map({
      container: container.current,
      style: MAP_STYLE,
      ...INITIAL_VIEW,
      maxBounds: AL_MAJAZ_BOUNDS,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      antialias: true,
      attributionControl: false,
      config: {
        basemap: { lightPreset: DEFAULT_LIGHT_PRESET },
      },
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('style.load', () => {
      // Sharjah is nearly flat, but the DEM keeps the water-rise effect (week
      // 3-4) sitting on real ground height instead of a plane at zero.
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        })
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION })

      setMap(map)
      setReady(true)
    })

    map.on('error', (event) => {
      console.error('[BaseMap]', event.error?.message ?? event)
    })

    return () => {
      setReady(false)
      setMap(null)
      map.remove()
    }
  }, [setMap, setReady])

  if (!MAPBOX_TOKEN) return <MissingTokenNotice />

  return <div ref={container} className="map-canvas" />
}
