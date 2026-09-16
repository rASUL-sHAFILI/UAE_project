import { useEffect, useRef } from 'react'

import { incidentsAt } from '../data/opsScenario'
import { useMapStore } from '../store/mapStore'
import { useOpsStore } from '../store/opsStore'
import { useScenarioStore } from '../store/scenarioStore'

/**
 * Moves the camera to the incident the dispatcher just selected.
 *
 * Only on a change of selection, never on a change of the clock: a selected
 * incident must not drag the camera back every time the scenario ticks, or
 * panning the map during playback becomes impossible.
 */
export function useFlyToSelection() {
  const map = useMapStore((state) => state.map)
  const selectedIncidentId = useOpsStore((state) => state.selectedIncidentId)
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (!map || !selectedIncidentId || previous.current === selectedIncidentId) {
      previous.current = selectedIncidentId
      return
    }
    previous.current = selectedIncidentId

    const minute = useScenarioStore.getState().minute
    const incident = incidentsAt(minute).find((item) => item.id === selectedIncidentId)
    if (!incident) return

    map.easeTo({
      center: incident.location,
      zoom: Math.max(map.getZoom(), 16),
      duration: 900,
      essential: true,
    })
  }, [map, selectedIncidentId])
}
