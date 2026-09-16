import { useTranslation } from '../../i18n/useTranslation'
import { LANGUAGES, LANGUAGE_LABELS } from '../../i18n/translations'

/** Switches the dashboard between Azerbaijani and English. */
export function LanguageSwitcher() {
  const { t, language, setLanguage } = useTranslation()

  return (
    <div className="lang" role="group" aria-label={t('app.language')}>
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          className={option === language ? 'is-active' : undefined}
          onClick={() => setLanguage(option)}
          aria-pressed={option === language}
        >
          {LANGUAGE_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
