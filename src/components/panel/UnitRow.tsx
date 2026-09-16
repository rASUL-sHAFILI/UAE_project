import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import type { RescueUnit } from '../../types'

const KIND_KEY: Record<RescueUnit['kind'], TranslationKey> = {
  ambulance: 'unit.ambulance',
  fire_truck: 'unit.fire_truck',
  police: 'unit.police',
  rescue_boat: 'unit.rescue_boat',
}

const STATUS_KEY: Record<RescueUnit['status'], TranslationKey> = {
  available: 'unitStatus.available',
  dispatched: 'unitStatus.dispatched',
  busy: 'unitStatus.busy',
}

/** One rescue unit in the roster. */
export function UnitRow({ unit }: { unit: RescueUnit }) {
  const { t } = useTranslation()

  return (
    <div className={`unit unit--${unit.status}`}>
      <span className="unit__sign">{unit.callSign}</span>
      <span className="unit__kind">{t(KIND_KEY[unit.kind])}</span>
      <span className="unit__status">{t(STATUS_KEY[unit.status])}</span>
      <span className="unit__eta">
        {unit.etaMinutes !== undefined ? `${t('panel.eta')} ${Math.ceil(unit.etaMinutes)}′` : ''}
      </span>
    </div>
  )
}
