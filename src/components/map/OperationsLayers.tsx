import { useEffect, useMemo } from 'react'
import type { FeatureCollection, Point } from 'geojson'

import { SLOTS } from '../../config/map'
import { incidentsAt, unitsAt } from '../../data/opsScenario'
import { useOpsStore } from '../../store/opsStore'
import { useMapStore } from '../../store/mapStore'
import {
  selectSmoothMinute,
  selectWholeMinute,
  useScenarioStore,
} from '../../store/scenarioStore'

const INCIDENT_SOURCE = 'incidents'
const UNIT_SOURCE = 'units'

const INCIDENT_HALO_LAYER = 'incident-halo'
const INCIDENT_LAYER = 'incident-point'
const UNIT_LAYER = 'unit-point'
const UNIT_LABEL_LAYER = 'unit-label'

const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }

/** Mapbox's own font stack, available in every standard style. */
const FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular']

function incidentsGeoJSON(minute: number, selectedId: string | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: incidentsAt(minute).map((incident) => ({
      type: 'Feature',
      id: incident.id,
      geometry: { type: 'Point', coordinates: incident.location },
      properties: {
        id: incident.id,
        priority: incident.priority,
        status: incident.status,
        kind: incident.kind,
        resolved: incident.status === 'resolved',
        selected: incident.id === selectedId,
      },
    })),
  }
}

function unitsGeoJSON(minute: number): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: unitsAt(minute).map((unit) => ({
      type: 'Feature',
      id: unit.id,
      geometry: { type: 'Point', coordinates: unit.location },
      properties: {
        id: unit.id,
        callSign: unit.callSign,
        kind: unit.kind,
        status: unit.status,
      },
    })),
  }
}

/**
 * Incidents and rescue units, drawn above everything else on the map.
 *
 * Both are pure projections of the scenario minute, so the units move as the
 * clock runs and jump to the right place when the timeline is scrubbed.
 */
export function OperationsLayers() {
  const map = useMapStore((state) => state.map)
  const isReady = useMapStore((state) => state.isReady)
  // Incidents change status on a schedule; units move continuously. Reading
  // the clock at two different resolutions keeps the markers gliding without
  // rebuilding the incident layer on every frame.
  const incidentMinute = useScenarioStore(selectWholeMinute)
  const unitMinute = useScenarioStore(selectSmoothMinute)
  const selectedIncidentId = useOpsStore((state) => state.selectedIncidentId)
  const toggleIncident = useOpsStore((state) => state.toggle)

  useEffect(() => {
    if (!map || !isReady) return

    if (!map.getSource(INCIDENT_SOURCE)) {
      map.addSource(INCIDENT_SOURCE, { type: 'geojson', data: EMPTY })
    }
    if (!map.getSource(UNIT_SOURCE)) {
      map.addSource(UNIT_SOURCE, { type: 'geojson', data: EMPTY })
    }

    if (!map.getLayer(INCIDENT_HALO_LAYER)) {
      map.addLayer({
        id: INCIDENT_HALO_LAYER,
        type: 'circle',
        source: INCIDENT_SOURCE,
        slot: SLOTS.units,
        // Only live calls get a halo. A resolved incident with a glow around
        // it reads as still needing attention.
        filter: ['==', ['get', 'resolved'], false],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'priority'], 1, 22, 5, 11],
          'circle-color': ['case', ['<=', ['get', 'priority'], 2], '#ff4d4d', '#f5c542'],
          'circle-opacity': 0.16,
          'circle-blur': 0.45,
        },
      })
    }

    if (!map.getLayer(INCIDENT_LAYER)) {
      map.addLayer({
        id: INCIDENT_LAYER,
        type: 'circle',
        source: INCIDENT_SOURCE,
        slot: SLOTS.units,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, ['get', 'resolved'], 4.5, 6.5],
          'circle-color': [
            'case',
            ['get', 'resolved'],
            '#5c6b80',
            [
              'match',
              ['get', 'priority'],
              1,
              '#ff4d4d',
              2,
              '#ff8c42',
              3,
              '#f5c542',
              4,
              '#4fd1c5',
              '#8b9bb4',
            ],
          ],
          'circle-stroke-width': ['case', ['get', 'selected'], 2.5, 1.2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#ffffff', '#0a0e14'],
          'circle-opacity': ['case', ['get', 'resolved'], 0.55, 1],
        },
      })
    }

    if (!map.getLayer(UNIT_LAYER)) {
      map.addLayer({
        id: UNIT_LAYER,
        type: 'circle',
        source: UNIT_SOURCE,
        slot: SLOTS.units,
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'status'],
            'available',
            '#3fa9ff',
            'dispatched',
            '#f5c542',
            '#4fd1c5',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0a0e14',
        },
      })
    }

    if (!map.getLayer(UNIT_LABEL_LAYER)) {
      map.addLayer({
        id: UNIT_LABEL_LAYER,
        type: 'symbol',
        source: UNIT_SOURCE,
        slot: SLOTS.units,
        layout: {
          'text-field': ['get', 'callSign'],
          'text-font': FONT,
          'text-size': 10,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e6edf7',
          'text-halo-color': '#0a0e14',
          'text-halo-width': 1.4,
        },
      })
    }

    const handleClick = (event: mapboxgl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [INCIDENT_LAYER] })[0]
      if (feature?.properties?.id) toggleIncident(String(feature.properties.id))
    }
    const showPointer = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const hidePointer = () => {
      map.getCanvas().style.cursor = ''
    }

    map.on('click', INCIDENT_LAYER, handleClick)
    map.on('mouseenter', INCIDENT_LAYER, showPointer)
    map.on('mouseleave', INCIDENT_LAYER, hidePointer)

    return () => {
      map.off('click', INCIDENT_LAYER, handleClick)
      map.off('mouseenter', INCIDENT_LAYER, showPointer)
      map.off('mouseleave', INCIDENT_LAYER, hidePointer)

      if (!map.getStyle()) return
      for (const layer of [UNIT_LABEL_LAYER, UNIT_LAYER, INCIDENT_LAYER, INCIDENT_HALO_LAYER]) {
        if (map.getLayer(layer)) map.removeLayer(layer)
      }
      for (const source of [UNIT_SOURCE, INCIDENT_SOURCE]) {
        if (map.getSource(source)) map.removeSource(source)
      }
    }
  }, [map, isReady, toggleIncident])

  const incidentData = useMemo(
    () => incidentsGeoJSON(incidentMinute, selectedIncidentId),
    [incidentMinute, selectedIncidentId],
  )
  const unitData = useMemo(() => unitsGeoJSON(unitMinute), [unitMinute])

  useEffect(() => {
    if (!map || !isReady) return
    const source = map.getSource(INCIDENT_SOURCE)
    if (source?.type === 'geojson') source.setData(incidentData)
  }, [map, isReady, incidentData])

  useEffect(() => {
    if (!map || !isReady) return
    const source = map.getSource(UNIT_SOURCE)
    if (source?.type === 'geojson') source.setData(unitData)
  }, [map, isReady, unitData])

  return null
}
