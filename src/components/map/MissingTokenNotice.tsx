import { useTranslation } from '../../i18n/useTranslation'

/**
 * Shown instead of the map when `VITE_MAPBOX_TOKEN` is absent, so a teammate
 * cloning the repo gets an instruction rather than a blank grey rectangle.
 */
export function MissingTokenNotice() {
  const { t } = useTranslation()

  return (
    <div className="map-canvas map-placeholder">
      <div className="map-placeholder__card">
        <h2>{t('token.title')}</h2>
        <ol>
          <li>{t('token.step1')}</li>
          <li>{t('token.step2')}</li>
          <li>{t('token.step3')}</li>
          <li>{t('token.step4')}</li>
        </ol>
      </div>
    </div>
  )
}
