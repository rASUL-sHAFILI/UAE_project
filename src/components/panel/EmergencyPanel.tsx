import { useMemo } from 'react'

import { incidentsAt, operationsSummaryAt, roadAccessCutAt, unitsAt } from '../../data/opsScenario'
import { useTranslation } from '../../i18n/useTranslation'
import { useOpsStore } from '../../store/opsStore'
import { selectWholeMinute, useScenarioStore } from '../../store/scenarioStore'
import { IncidentRow } from './IncidentRow'
import { UnitRow } from './UnitRow'

/** Status order for the list: live work first, cleared calls at the bottom. */
const STATUS_RANK = { pending: 0, en_route: 1, assigned: 2, resolved: 3 } as const

/**
 * The dispatcher's working surface: what is happening, who is on it, and what
 * is still unassigned.
 *
 * Sorted by urgency rather than by time. A dispatcher reads this list from the
 * top under pressure, so the top has to be the thing that matters most, not
 * the thing that happened most recently.
 */
export function EmergencyPanel() {
  const { t } = useTranslation()
  // Nothing in this panel can show a fraction of a minute, and re-sorting
  // fifteen rows on every animation frame is what made the list stutter
  // while the scenario played.
  const minute = useScenarioStore(selectWholeMinute)
  const selectedIncidentId = useOpsStore((state) => state.selectedIncidentId)
  const toggleIncident = useOpsStore((state) => state.toggle)

  const summary = useMemo(() => operationsSummaryAt(minute), [minute])
  const units = useMemo(() => unitsAt(minute), [minute])
  const incidents = useMemo(
    () =>
      incidentsAt(minute).sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          a.priority - b.priority ||
          b.reportedAtMinute - a.reportedAtMinute,
      ),
    [minute],
  )

  return (
    <aside className="panel">
      <div className="panel__summary">
        <div className="stat stat--alert">
          <strong>{summary.critical}</strong>
          <span>{t('panel.critical')}</span>
        </div>
        <div className="stat">
          <strong>{summary.open}</strong>
          <span>{t('panel.open')}</span>
        </div>
        <div className="stat">
          <strong>{summary.peopleAffected}</strong>
          <span>{t('panel.people')}</span>
        </div>
        <div className="stat">
          <strong>
            {summary.unitsAvailable}/{summary.unitsTotal}
          </strong>
          <span>{t('panel.available')}</span>
        </div>
      </div>

      {roadAccessCutAt(minute) ? (
        <p className="panel__warning">{t('panel.roadCut')}</p>
      ) : null}

      <section className="panel__section">
        <h2>
          {t('panel.units')}
          <span>{summary.unitsTotal}</span>
        </h2>
        <div className="panel__units">
          {units.map((unit) => (
            <UnitRow key={unit.id} unit={unit} />
          ))}
        </div>
      </section>

      <section className="panel__section panel__section--grow">
        <h2>
          {t('panel.incidents')}
          <span>{incidents.length}</span>
        </h2>

        {incidents.length === 0 ? (
          <p className="panel__empty">{t('panel.empty')}</p>
        ) : (
          <div className="panel__incidents">
            {incidents.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                isSelected={incident.id === selectedIncidentId}
                onSelect={toggleIncident}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}
