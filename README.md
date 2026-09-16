# Al-Majaz Emergency Response — Frontend

Flood and emergency response dashboard for Al-Majaz, Sharjah (UAE).
React + TypeScript + Vite + Mapbox GL JS.

Şarja (BAE) Al-Majaz rayonu üçün daşqın və fövqəladə hal idarəetmə panelinin
frontend hissəsi.

## Getting started

```bash
npm install
cp .env.example .env.local   # then paste your own Mapbox token
npm run dev
```

The map needs a Mapbox public token in `.env.local`:

```
VITE_MAPBOX_TOKEN=pk.xxxxxxxx
```

Get a free one at https://account.mapbox.com/access-tokens/. `.env.local` is
gitignored, so every team member uses their own token. Without one the app
still runs and tells you what is missing instead of showing a blank map.

## Where the data comes from

The dashboard is built against the backend contract, not against the backend.
Until Ali's FastAPI service is up it runs on a scripted scenario that emits the
same shapes the real feed will, so switching over is a change of transport and
nothing else:

```
VITE_WS_URL=ws://localhost:8000/ws
```

Leave it empty and the connection badge reads **Scripted feed**. It is never
disguised as a live socket.

Both the flood and the operational picture are pure functions of the scenario
minute and seeded throughout, so dragging the timeline backwards shows exactly
what it showed going forward and every rehearsal looks like the one on stage.

## Structure

```
src/
  config/map.ts          Al-Majaz coordinates, camera, layer slots
  config/scenario.ts     Scenario timing, depths, thresholds
  data/floodScenario.ts  Synthetic flood surface (stands in for the IoT feed)
  data/opsScenario.ts    Emergency calls and rescue units
  data/agentProposals.ts Decisions the agents ask the operator for
  services/eventStream.ts WebSocket transport, with the scripted fallback
  i18n/                  Bilingual dictionary — no UI string is written inline
  components/map/        Base map, flood layers, units, transport controls
  components/panel/      Dispatcher panel
  components/modal/      Autonomous approval
  store/                 Map handle, scenario clock, selection, agent state
```

`config/map.ts` holds every geographic constant, so moving the scenario to
another district means editing one file.

## Layer slots

Mapbox Standard exposes three insertion slots. Use the `SLOTS` constant when
adding a layer, or it will draw on top of every label in the basemap.

| Slot | What goes there |
|---|---|
| `bottom` | Below roads and buildings |
| `middle` | Heatmap, flood water, incident zones |
| `top` | Rescue units, routes, markers |

Flood water sits in `middle`, not `bottom`: standing water covers the road, and
drawn underneath it the basemap's own road fills sit on top and the street
reads as dry.

## Adding UI text

Every user-visible string goes in `src/i18n/translations.ts` with both
languages. A missing key renders as the key itself — loud in review, harmless
on stage. Do not write text directly in a component.

## Roadmap (@Rasul)

- [x] **Week 1-2** — 3D Al-Majaz base map
- [x] **Week 3-4** — flood heatmap and rising water surface
- [x] **Week 5-6** — dispatcher panel, incidents and units on the map
- [x] **Week 7** — WebSocket event stream and autonomous approval UI
- [ ] **Week 8-9** — end-to-end demo run and pitch

Still open, and owned elsewhere: real routing from the router agent (straight
lines stand in for routes today), and the live backend behind `VITE_WS_URL`.

## Backend

PostGIS and FastAPI, in Docker. Start it with the same file Vite reads, so the
Mapbox token lives in one place:

```bash
npm run backend:up      # docker compose --env-file .env.local up -d
npm run backend:logs
npm run backend:down
```

`http://localhost:8000/health` reports what the system can actually do — a
missing Mapbox token means no real routing and no real terrain, and a missing
Anthropic key means the triage agent falls back to rules. Both are survivable
and neither is hidden.

For real LLM triage, add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### What is real, and what is simulated

Real: the ground (Mapbox Terrain-RGB elevation), the roads and travel times
(Mapbox Directions), the places calls come from (Mapbox Streets), the spatial
queries (PostGIS), the flood spread (a connected bathtub model over that
elevation), and the triage classifier when a key is present.

Simulated: the arrival of calls and the words the callers say. Nobody has a
live feed of Sharjah's emergency line, and that is the one part that has to be
invented. It lives behind `app/sim/`, emits the same shapes a real feed would,
and is the only module that gets replaced when one exists.

### Layout

```
backend/app/
  models.py        PostGIS schema
  api/             HTTP surface and serialisers
  agents/          triage (Claude), allocator, router (Directions)
  services/        spatial queries, WebSocket fan-out
  sim/             terrain, flood model, places, call generator, engine
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | oxlint |
| `npm run preview` | Local preview of the build |

## Deploying

Vercel auto-detects the Vite preset. Two things are easy to miss:

1. Add `VITE_MAPBOX_TOKEN` under **Environment Variables** before deploying —
   env vars are read at build time, so a variable added later needs a redeploy.
2. **Settings → Deployment Protection → Vercel Authentication** must be
   disabled, or anyone without a Vercel login lands on a sign-in page.

Once the site is public, restrict the Mapbox token to its domain under
**Token restrictions** in the Mapbox dashboard.
