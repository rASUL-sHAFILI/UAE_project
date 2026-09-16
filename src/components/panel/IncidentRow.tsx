import { UNITS } from '../../data/opsScenario'
import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import type { Incident } from '../../types'

const KIND_KEY: Record<Incident['kind'], TranslationKey> = {
  flood: 'kind.flood',
  traffic: 'kind.traffic',
  medical: 'kind.medical',
  fire: 'kind.fire',
  rescue: 'kind.rescue',
}

const STATUS_KEY: Record<Incident['status'], TranslationKey> = {
  pending: 'status.pending',
  assigned: 'status.assigned',
  en_route: 'status.en_route',
  resolved: 'status.resolved',
}

const CALL_SIGNS = new Map(UNITS.map((unit) => [unit.id, unit.callSign]))

interface Props {
  incident: Incident
  isSelected: boolean
  onSelect: (incidentId: string) => void
}

/** One emergency call in the dispatcher's list. */
export function IncidentRow({ incident, isSelected, onSelect }: Props) {
  const { t, language, locale } = useTranslation()

  const reported = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  }).format(new Date(incident.reportedAt))

  const classes = [
    'incident',
    `incident--p${incident.priority}`,
    incident.status === 'resolved' ? 'is-resolved' : '',
    isSelected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} onClick={() => onSelect(incident.id)}>
      <span className="incident__priority" aria-hidden="true">
        P{incident.priority}
      </span>

      <span className="incident__body">
        <span className="incident__head">
          <strong>{t(KIND_KEY[incident.kind])}</strong>
          <span className="incident__time">{reported}</span>
        </span>

        <span className="incident__address">{incident.address[language]}</span>
        <span className="incident__description">{incident.description[language]}</span>

        <span className="incident__meta">
          <span className={`incident__status incident__status--${incident.status}`}>
            {t(STATUS_KEY[incident.status])}
          </span>
          <span>
            {incident.assignedUnitId
              ? CALL_SIGNS.get(incident.assignedUnitId)
              : t('panel.unassigned')}
          </span>
          {incident.peopleAffected ? <span>{incident.peopleAffected} 👤</span> : null}
        </span>
      </span>
    </button>
  )
}
