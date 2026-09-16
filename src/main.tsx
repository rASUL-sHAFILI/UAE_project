import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import App from './App.tsx'
import { useAgentStore } from './store/agentStore'
import { useOpsStore } from './store/opsStore'
import { useScenarioStore } from './store/scenarioStore'

// Dev-only handles on the stores, next to the map instance BaseMap exposes.
// Driving the scenario from the console is how the timeline, the agent queue
// and the render cost get checked without clicking through the whole run.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __scenario: useScenarioStore,
    __ops: useOpsStore,
    __agents: useAgentStore,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
