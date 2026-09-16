/**
 * The emergency calls and the units that answer them.
 *
 * Like the flood data, this is a scripted stand-in for Ali's backend: every
 * call, assignment and arrival is written down with the scenario minute it
 * happens at, and the whole operational picture is derived from that minute.
 * Nothing accumulates state, so scrubbing the timeline is exact in both
 * directions.
 *
 * The script is also the demo's story. Calls arrive faster than units free up,
 * the waterfront cluster forces the allocator to choose, and one route is cut
 * by water deep enough to stop a road vehicle — which is the moment the
 * autonomous approval modal exists for.
 */

import { IMPASSABLE_DEPTH } from '../config/scenario'
import { distanceMetres } from '../lib/geo'
import type {
  Coordinates,
  Incident,
  IncidentKind,
  Priority,
  RescueUnit,
  UnitKind,
} from '../types'
import { peakDepthAt, scenarioTime } from './floodScenario'

interface ScriptedIncident {
  id: string
  kind: IncidentKind
  priority: Priority
  location: Coordinates
  address: { az: string; en: string }
  description: { az: string; en: string }
  reportedAtMinute: number
  peopleAffected?: number
  /** Unit scripted to take this call, and when it is dispatched. */
  assignment?: { unitId: string; dispatchedAtMinute: number; resolvedAtMinute?: number }
}

interface ScriptedUnit {
  id: string
  callSign: string
  kind: UnitKind
  /** Where the unit waits when it has nothing to do. */
  base: Coordinates
}

/** Four stations around the district, roughly where Sharjah's really are. */
export const UNITS: ScriptedUnit[] = [
  { id: 'amb-04', callSign: 'AMB-04', kind: 'ambulance', base: [55.3869, 25.3312] },
  { id: 'amb-07', callSign: 'AMB-07', kind: 'ambulance', base: [55.3748, 25.3195] },
  { id: 'fire-02', callSign: 'FIRE-02', kind: 'fire_truck', base: [55.3822, 25.3352] },
  { id: 'pol-11', callSign: 'POL-11', kind: 'police', base: [55.3795, 25.3168] },
  { id: 'boat-01', callSign: 'BOAT-01', kind: 'rescue_boat', base: [55.3836, 25.3245] },
  { id: 'boat-02', callSign: 'BOAT-02', kind: 'rescue_boat', base: [55.3781, 25.3292] },
]

/**
 * Average speed by unit type, in metres per simulated minute.
 *
 * Road units are slow here on purpose: this is a flooded city centre, not an
 * open motorway. The boats are not faster in absolute terms, they are simply
 * the only thing that still moves once a street is over the impassable depth.
 */
const SPEED_METRES_PER_MINUTE: Record<UnitKind, number> = {
  ambulance: 420,
  fire_truck: 360,
  police: 460,
  rescue_boat: 300,
}

export const INCIDENTS: ScriptedIncident[] = [
  {
    id: 'inc-001',
    kind: 'flood',
    priority: 2,
    location: [55.3768, 25.3241],
    address: { az: 'Al Majaz Waterfront, 3-cü giriş', en: 'Al Majaz Waterfront, Gate 3' },
    description: {
      az: 'Parkinqdə su qalxır, avtomobillər su altında qalıb.',
      en: 'Water rising in the car park, vehicles submerged.',
    },
    reportedAtMinute: 6,
    peopleAffected: 4,
    assignment: { unitId: 'pol-11', dispatchedAtMinute: 9, resolvedAtMinute: 41 },
  },
  {
    id: 'inc-002',
    kind: 'medical',
    priority: 1,
    location: [55.3786, 25.3229],
    address: { az: 'Al Majaz 1, Al Qasba körpüsü', en: 'Al Majaz 1, Al Qasba Bridge' },
    description: {
      az: 'Yaşlı xəstə, tənəffüs çətinliyi. Lift işləmir.',
      en: 'Elderly patient, breathing difficulty. Lift out of service.',
    },
    reportedAtMinute: 14,
    peopleAffected: 1,
    assignment: { unitId: 'amb-07', dispatchedAtMinute: 16, resolvedAtMinute: 52 },
  },
  {
    id: 'inc-003',
    kind: 'traffic',
    priority: 3,
    location: [55.3830, 25.3262],
    address: { az: 'Buhaira Corniche, Al Noor Island girişi', en: 'Buhaira Corniche, Al Noor Island entrance' },
    description: {
      az: 'İki avtomobil toqquşub, yol tam bağlanıb.',
      en: 'Two-car collision, carriageway fully blocked.',
    },
    reportedAtMinute: 23,
    peopleAffected: 3,
    assignment: { unitId: 'pol-11', dispatchedAtMinute: 44, resolvedAtMinute: 74 },
  },
  {
    id: 'inc-004',
    kind: 'rescue',
    priority: 1,
    location: [55.3757, 25.3232],
    address: { az: 'Al Majaz Waterfront, amfiteatr', en: 'Al Majaz Waterfront, amphitheatre' },
    description: {
      az: 'Altı nəfər suyun ortasında qalıb, yol kəsilib.',
      en: 'Six people cut off by water, access road under water.',
    },
    reportedAtMinute: 31,
    peopleAffected: 6,
    assignment: { unitId: 'boat-02', dispatchedAtMinute: 35, resolvedAtMinute: 78 },
  },
  {
    id: 'inc-005',
    kind: 'flood',
    priority: 3,
    location: [55.3848, 25.3279],
    address: { az: 'Corniche St, Safeer Market', en: 'Corniche St, Safeer Market' },
    description: {
      az: 'Zirzəmi su ilə dolur, elektrik paneli risk altındadır.',
      en: 'Basement filling with water, electrical panel at risk.',
    },
    reportedAtMinute: 38,
    assignment: { unitId: 'fire-02', dispatchedAtMinute: 40, resolvedAtMinute: 83 },
  },
  {
    id: 'inc-006',
    kind: 'medical',
    priority: 2,
    location: [55.3862, 25.3318],
    address: { az: 'Al Qasimia, Medcare Hospital yaxınlığı', en: 'Al Qasimia, near Medcare Hospital' },
    description: {
      az: 'Piyada avtomobillə toqquşub, şüuru yerindədir.',
      en: 'Pedestrian struck by a car, conscious and responsive.',
    },
    reportedAtMinute: 47,
    peopleAffected: 1,
    assignment: { unitId: 'amb-04', dispatchedAtMinute: 49, resolvedAtMinute: 88 },
  },
  {
    id: 'inc-007',
    kind: 'rescue',
    priority: 1,
    location: [55.3779, 25.3251],
    address: { az: 'Al Majaz 2, 26 St', en: 'Al Majaz 2, 26 St' },
    description: {
      az: 'Avtobus suda qalıb, sürücü və on bir sərnişin içəridədir.',
      en: 'Bus stalled in floodwater, driver and eleven passengers aboard.',
    },
    reportedAtMinute: 56,
    peopleAffected: 12,
    assignment: { unitId: 'boat-01', dispatchedAtMinute: 59, resolvedAtMinute: 104 },
  },
  {
    id: 'inc-008',
    kind: 'fire',
    priority: 1,
    location: [55.3801, 25.3298],
    address: { az: 'Al Khalidiya, Sharjah Co-operative Society', en: 'Al Khalidiya, Sharjah Co-operative Society' },
    description: {
      az: 'Elektrik yanğını, tüstü yayılır, bina boşaldılır.',
      en: 'Electrical fire, smoke spreading, building being evacuated.',
    },
    reportedAtMinute: 69,
    peopleAffected: 30,
    assignment: { unitId: 'fire-02', dispatchedAtMinute: 86, resolvedAtMinute: 132 },
  },
  {
    id: 'inc-009',
    kind: 'flood',
    priority: 4,
    location: [55.3744, 25.3311],
    address: { az: 'Al Khalidiya, Sharjah Aquarium parkinqi', en: 'Al Khalidiya, Sharjah Aquarium car park' },
    description: {
      az: 'Parkinqin aşağı mərtəbəsi su altındadır, insan yoxdur.',
      en: 'Lower car park flooded, no people reported inside.',
    },
    reportedAtMinute: 77,
  },
  {
    id: 'inc-010',
    kind: 'medical',
    priority: 2,
    location: [55.3818, 25.3193],
    address: { az: 'Al Majaz 3, 29 St', en: 'Al Majaz 3, 29 St' },
    description: {
      az: 'Dializ xəstəsi evdə qalıb, müalicəyə çatdırılmalıdır.',
      en: 'Dialysis patient stranded at home, needs transport to treatment.',
    },
    reportedAtMinute: 92,
    peopleAffected: 1,
    assignment: { unitId: 'amb-07', dispatchedAtMinute: 95, resolvedAtMinute: 141 },
  },
  {
    id: 'inc-011',
    kind: 'rescue',
    priority: 1,
    location: [55.3838, 25.3259],
    address: { az: 'Buhaira Corniche, gəzinti körpüsü', en: 'Buhaira Corniche, footbridge' },
    description: {
      az: 'Üç nəfər körpüdə qalıb, su hər iki tərəfdən yüksəlir.',
      en: 'Three people trapped on a footbridge, water rising both sides.',
    },
    reportedAtMinute: 101,
    peopleAffected: 3,
    assignment: { unitId: 'boat-02', dispatchedAtMinute: 106, resolvedAtMinute: 148 },
  },
  {
    id: 'inc-012',
    kind: 'traffic',
    priority: 3,
    location: [55.3871, 25.3334],
    address: { az: 'Al Qasimia, King Faisal St', en: 'Al Qasimia, King Faisal St' },
    description: {
      az: 'Yük maşını yolu bağlayıb, təxliyə marşrutu kəsilib.',
      en: 'Lorry blocking the road, evacuation route cut.',
    },
    reportedAtMinute: 113,
    assignment: { unitId: 'pol-11', dispatchedAtMinute: 115, resolvedAtMinute: 156 },
  },
  {
    id: 'inc-013',
    kind: 'rescue',
    priority: 2,
    location: [55.3762, 25.3268],
    address: { az: 'Al Majaz Waterfront, şimal sahil', en: 'Al Majaz Waterfront, north shore' },
    description: {
      az: 'İki nəfər damda gözləyir, yol nəqliyyatı keçə bilmir.',
      en: 'Two people waiting on a roof, no road access for vehicles.',
    },
    reportedAtMinute: 124,
    peopleAffected: 2,
    assignment: { unitId: 'boat-01', dispatchedAtMinute: 128, resolvedAtMinute: 167 },
  },
  {
    id: 'inc-014',
    kind: 'medical',
    priority: 1,
    location: [55.3805, 25.3175],
    address: { az: 'Al Majaz 3, Jamal Abdul Nasser St', en: 'Al Majaz 3, Jamal Abdul Nasser St' },
    description: {
      az: 'Ürək tutması şübhəsi, reanimasiya tələb oluna bilər.',
      en: 'Suspected cardiac arrest, resuscitation may be required.',
    },
    reportedAtMinute: 139,
    peopleAffected: 1,
    assignment: { unitId: 'amb-04', dispatchedAtMinute: 141 },
  },
  {
    id: 'inc-015',
    kind: 'flood',
    priority: 4,
    location: [55.3855, 25.3301],
    address: { az: 'Al Qasimia, Lulu Hypermarket', en: 'Al Qasimia, Lulu Hypermarket' },
    description: {
      az: 'Anbar su altındadır, işçilər təxliyə olunub.',
      en: 'Storeroom flooded, staff already evacuated.',
    },
    reportedAtMinute: 151,
  },
]

const UNITS_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]))

/** Travel time in simulated minutes between two points for a given unit type. */
function travelMinutes(kind: UnitKind, from: Coordinates, to: Coordinates): number {
  return distanceMetres(from, to) / SPEED_METRES_PER_MINUTE[kind]
}

/** Linear interpolation between two coordinates. */
function lerp(from: Coordinates, to: Coordinates, fraction: number): Coordinates {
  return [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
  ]
}

/** Status of one scripted incident at a given minute. */
function statusAt(incident: ScriptedIncident, minute: number): Incident['status'] {
  const { assignment } = incident
  if (!assignment) return 'pending'
  if (assignment.resolvedAtMinute !== undefined && minute >= assignment.resolvedAtMinute) {
    return 'resolved'
  }
  if (minute < assignment.dispatchedAtMinute) return 'pending'

  const unit = UNITS_BY_ID.get(assignment.unitId)
  if (!unit) return 'assigned'

  const arrival =
    assignment.dispatchedAtMinute + travelMinutes(unit.kind, unit.base, incident.location)
  return minute < arrival ? 'en_route' : 'assigned'
}

/**
 * Every call known to the dispatcher at this minute.
 *
 * Resolved incidents stay in the list rather than disappearing: a dispatcher
 * needs to see what has been cleared, and a demo that silently drops rows
 * looks like it lost them.
 */
export function incidentsAt(minute: number): Incident[] {
  return INCIDENTS.filter((incident) => minute >= incident.reportedAtMinute).map(
    (incident): Incident => ({
      id: incident.id,
      kind: incident.kind,
      priority: incident.priority,
      location: incident.location,
      address: incident.address,
      description: incident.description,
      reportedAt: scenarioTime(incident.reportedAtMinute).toISOString(),
      reportedAtMinute: incident.reportedAtMinute,
      status: statusAt(incident, minute),
      assignedUnitId: incident.assignment?.unitId,
      peopleAffected: incident.peopleAffected,
    }),
  )
}

/** The assignment a unit is working at this minute, if any. */
function activeAssignment(unitId: string, minute: number) {
  return INCIDENTS.find((incident) => {
    const assignment = incident.assignment
    if (!assignment || assignment.unitId !== unitId) return false
    if (minute < assignment.dispatchedAtMinute) return false
    return assignment.resolvedAtMinute === undefined || minute < assignment.resolvedAtMinute
  })
}

/**
 * Where every unit is and what it is doing at this minute.
 *
 * Units travel in a straight line from their base to the incident. That is not
 * a route — the routing agent owns that in week 5-6 — but it is honest about
 * the one thing the map needs to show now, which is that a unit is in transit
 * and roughly how far along it is.
 */
export function unitsAt(minute: number): RescueUnit[] {
  return UNITS.map((unit): RescueUnit => {
    const incident = activeAssignment(unit.id, minute)
    if (!incident?.assignment) {
      return {
        id: unit.id,
        callSign: unit.callSign,
        kind: unit.kind,
        location: unit.base,
        status: 'available',
      }
    }

    const { dispatchedAtMinute } = incident.assignment
    const journeyMinutes = travelMinutes(unit.kind, unit.base, incident.location)
    const elapsed = minute - dispatchedAtMinute
    const fraction = journeyMinutes === 0 ? 1 : Math.min(elapsed / journeyMinutes, 1)

    return {
      id: unit.id,
      callSign: unit.callSign,
      kind: unit.kind,
      location: lerp(unit.base, incident.location, fraction),
      status: fraction < 1 ? 'dispatched' : 'busy',
      assignedIncidentId: incident.id,
      etaMinutes: fraction < 1 ? Math.max(journeyMinutes - elapsed, 0) : undefined,
    }
  })
}

/** Headline counts for the panel's summary strip. */
export function operationsSummaryAt(minute: number) {
  const incidents = incidentsAt(minute)
  const units = unitsAt(minute)

  return {
    open: incidents.filter((incident) => incident.status !== 'resolved').length,
    critical: incidents.filter(
      (incident) => incident.status !== 'resolved' && incident.priority === 1,
    ).length,
    resolved: incidents.filter((incident) => incident.status === 'resolved').length,
    unitsAvailable: units.filter((unit) => unit.status === 'available').length,
    unitsTotal: units.length,
    peopleAffected: incidents
      .filter((incident) => incident.status !== 'resolved')
      .reduce((total, incident) => total + (incident.peopleAffected ?? 0), 0),
  }
}

/**
 * Whether road units can still reach the waterfront cluster.
 *
 * The deepest water in the district crossing the impassable threshold is the
 * trigger for the autonomous re-tasking the approval modal asks about, so the
 * check lives here beside the data rather than inside a component.
 */
export function roadAccessCutAt(minute: number): boolean {
  return peakDepthAt(minute) >= IMPASSABLE_DEPTH
}
