/**
 * Domain types shared across the dashboard.
 *
 * These mirror the payloads the FastAPI backend is expected to emit over
 * WebSocket (week 7). They are declared up-front so that the map layers and
 * the emergency panel can be built against mock data that already has the
 * final shape.
 */

/** [longitude, latitude] — GeoJSON order, not Google Maps order. */
export type Coordinates = [number, number]

/** Triage priority produced by the classifier agent. 1 = most urgent. */
export type Priority = 1 | 2 | 3 | 4 | 5

export type IncidentKind = 'flood' | 'traffic' | 'medical' | 'fire' | 'rescue'

export interface Incident {
  id: string
  kind: IncidentKind
  priority: Priority
  location: Coordinates
  /** Human-readable place, e.g. "Al Majaz Waterfront, Gate 3". */
  address: string
  /** Free-text summary of the emergency call. */
  description: string
  reportedAt: string
  status: 'pending' | 'assigned' | 'en_route' | 'resolved'
}

export type UnitKind = 'ambulance' | 'fire_truck' | 'police' | 'rescue_boat'

export interface RescueUnit {
  id: string
  kind: UnitKind
  location: Coordinates
  status: 'available' | 'dispatched' | 'busy'
  /** Incident this unit is currently assigned to, if any. */
  assignedIncidentId?: string
}

/** One sample of the flood surface, used to feed the heatmap layer. */
export interface FloodReading {
  location: Coordinates
  /** Water depth in metres. */
  depth: number
  measuredAt: string
}
