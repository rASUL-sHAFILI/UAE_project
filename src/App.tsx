import { BaseMap } from './components/map/BaseMap'
import { FloodLayers } from './components/map/FloodLayers'
import { MapControls } from './components/map/MapControls'
import { OperationsLayers } from './components/map/OperationsLayers'
import { ScenarioClock } from './components/map/ScenarioClock'
import { ApprovalModal } from './components/modal/ApprovalModal'
import { EmergencyPanel } from './components/panel/EmergencyPanel'
import { ConnectionBadge } from './components/ui/ConnectionBadge'
import { LanguageSwitcher } from './components/ui/LanguageSwitcher'
import { NotificationStack } from './components/ui/NotificationStack'
import { useEventStream } from './hooks/useEventStream'
import { useFlyToSelection } from './hooks/useFlyToSelection'
import { useScenarioClock } from './hooks/useScenarioClock'
import { useTranslation } from './i18n/useTranslation'

/**
 * Application shell.
 *
 * A dispatcher's screen: the map carries the situation and the panel beside it
 * carries the work. The two share one clock, so nothing on screen can disagree
 * with anything else about what time it is.
 */
export default function App() {
  const { t } = useTranslation()

  useScenarioClock()
  useEventStream()
  useFlyToSelection()

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__dot" aria-hidden="true" />
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="app__actions">
          <ConnectionBadge />
          <span className="app__phase">{t('app.phase')}</span>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="app__body">
        <main className="app__map">
          <BaseMap />
          <FloodLayers />
          <OperationsLayers />
          <MapControls />
          <ScenarioClock />
        </main>

        <EmergencyPanel />
      </div>

      <NotificationStack />
      <ApprovalModal />
    </div>
  )
}
