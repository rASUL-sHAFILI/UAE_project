import { useEffect } from 'react'
import type { FeatureCollection } from 'geojson'

import { SLOTS } from '../../config/map'
import { floodExtentGeoJSON, floodReadingsGeoJSON } from '../../data/floodScenario'
import { useMapStore } from '../../store/mapStore'
import { useScenarioStore } from '../../store/scenarioStore'

const READINGS_SOURCE = 'flood-readings'
const EXTENT_SOURCE = 'flood-extent'

const HEATMAP_LAYER = 'flood-heatmap'
const WATER_LAYER = 'flood-water'
const WATER_EDGE_LAYER = 'flood-water-edge'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * The flood surface: a density heatmap of sensor readings and a 3D water body
 * that rises as the scenario runs.
 *
 * The two are deliberately tuned to trade places with zoom. Pulled back, the
 * heatmap answers "where is it worst"; up close it fades out and the extruded
 * water answers "how deep is this street", which is the question the dispatcher
 * is actually asking.
 */
export function FloodLayers() {
  const map = useMapStore((state) => state.map)
  const isReady = useMapStore((state) => state.isReady)
  const minute = useScenarioStore((state) => state.minute)

  // Create the sources and layers once per map instance.
  useEffect(() => {
    if (!map || !isReady) return

    if (!map.getSource(READINGS_SOURCE)) {
      map.addSource(READINGS_SOURCE, { type: 'geojson', data: EMPTY })
    }
    if (!map.getSource(EXTENT_SOURCE)) {
      map.addSource(EXTENT_SOURCE, { type: 'geojson', data: EMPTY })
    }

    if (!map.getLayer(HEATMAP_LAYER)) {
      map.addLayer({
        id: HEATMAP_LAYER,
        type: 'heatmap',
        source: READINGS_SOURCE,
        slot: SLOTS.heatmap,
        paint: {
          // A sensor reading counts for more the deeper the water it reports.
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'depth'], 0, 0, 2, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 2.4],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0, 0, 0, 0)',
            0.2,
            'rgba(56, 132, 255, 0.55)',
            0.4,
            'rgba(56, 214, 255, 0.7)',
            0.6,
            'rgba(255, 214, 102, 0.8)',
            0.8,
            'rgba(255, 138, 66, 0.88)',
            1,
            'rgba(255, 71, 71, 0.95)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 13, 18, 17, 70],
          // Hand over to the 3D water body as the camera comes in.
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.9, 16.5, 0.35],
        },
      })
    }

    if (!map.getLayer(WATER_LAYER)) {
      map.addLayer({
        id: WATER_LAYER,
        type: 'fill-extrusion',
        source: EXTENT_SOURCE,
        slot: SLOTS.flood,
        paint: {
          // Shallow water reads blue, dangerous water reads red, with the
          // impassable-for-vehicles threshold sitting at the colour change.
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['get', 'depth'],
            0,
            '#1e6fd9',
            0.45,
            '#22b8d6',
            1,
            '#f2a33c',
            1.8,
            '#e04141',
          ],
          'fill-extrusion-base': 0,
          // Rendered height is the exaggerated one; colour stays on true depth.
          'fill-extrusion-height': ['get', 'renderHeight'],
          'fill-extrusion-opacity': 0.62,
        },
      })
    }

    if (!map.getLayer(WATER_EDGE_LAYER)) {
      map.addLayer({
        id: WATER_EDGE_LAYER,
        type: 'line',
        source: EXTENT_SOURCE,
        slot: SLOTS.flood,
        paint: {
          'line-color': 'rgba(120, 220, 255, 0.85)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2],
          'line-blur': 0.6,
        },
      })
    }

    return () => {
      // The map may already be torn down when this runs; removing layers from
      // a removed map throws, and there is nothing left to clean up anyway.
      if (!map.getStyle()) return
      for (const layer of [WATER_EDGE_LAYER, WATER_LAYER, HEATMAP_LAYER]) {
        if (map.getLayer(layer)) map.removeLayer(layer)
      }
      for (const source of [EXTENT_SOURCE, READINGS_SOURCE]) {
        if (map.getSource(source)) map.removeSource(source)
      }
    }
  }, [map, isReady])

  // Push new data on every tick of the scenario clock.
  useEffect(() => {
    if (!map || !isReady) return

    const readings = map.getSource(READINGS_SOURCE)
    const extent = map.getSource(EXTENT_SOURCE)
    if (readings?.type !== 'geojson' || extent?.type !== 'geojson') return

    readings.setData(floodReadingsGeoJSON(minute))
    extent.setData(floodExtentGeoJSON(minute))
  }, [map, isReady, minute])

  return null
}
