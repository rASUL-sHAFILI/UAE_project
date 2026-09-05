/**
 * Shown instead of the map when `VITE_MAPBOX_TOKEN` is absent, so a teammate
 * cloning the repo gets an instruction rather than a blank grey rectangle.
 */
export function MissingTokenNotice() {
  return (
    <div className="map-canvas map-placeholder">
      <div className="map-placeholder__card">
        <h2>Mapbox token tapılmadı</h2>
        <ol>
          <li>
            <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">
              account.mapbox.com
            </a>{' '}
            ünvanından public token götür.
          </li>
          <li>
            Layihənin kökündə <code>.env.local</code> faylı yarat.
          </li>
          <li>
            İçinə yaz: <code>VITE_MAPBOX_TOKEN=pk.xxxxx</code>
          </li>
          <li>
            <code>npm run dev</code> əmrini yenidən işə sal.
          </li>
        </ol>
      </div>
    </div>
  )
}
