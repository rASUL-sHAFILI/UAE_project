import { BaseMap } from './components/map/BaseMap'
import { MapControls } from './components/map/MapControls'

/**
 * Application shell.
 *
 * The map occupies the full viewport and every panel is overlaid on top of it.
 * The emergency panel and the incident list (week 5-6) slot in beside
 * `MapControls` without changing this layout.
 */
export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__dot" aria-hidden="true" />
          <div>
            <h1>Al-Majaz Emergency Response</h1>
            <p>Sharjah, UAE · Daşqın və fövqəladə hal idarəetməsi</p>
          </div>
        </div>
        <span className="app__phase">Həftə 1-2 · 3D baza xəritəsi</span>
      </header>

      <main className="app__map">
        <BaseMap />
        <MapControls />
      </main>
    </div>
  )
}
