# Al-Majaz Emergency Response — Frontend

Sharjah (Al-Majaz) üçün daşqın və fövqəladə hal idarəetmə sisteminin frontend
hissəsi. React + TypeScript + Vite + Mapbox GL JS.

## Başlanğıc

```bash
npm install
cp .env.example .env.local   # sonra token-i içinə yaz
npm run dev
```

Xəritə görünməsi üçün `.env.local` faylında Mapbox public token lazımdır:

```
VITE_MAPBOX_TOKEN=pk.xxxxxxxx
```

Token-i https://account.mapbox.com/access-tokens/ ünvanından pulsuz götürmək
olar. `.env.local` git-ə düşmür, ona görə hər komanda üzvü öz token-ini yazır.

## Struktur

```
src/
  config/map.ts        Al-Majaz koordinatları, kamera, layer slot-ları
  types/index.ts       Backend-lə paylaşılan domen tipləri
  store/mapStore.ts    Mapbox instance-ı və işıq rejimi (zustand)
  components/map/      Baza xəritəsi və demo kontrolları
```

`config/map.ts` faylı bütün coğrafi sabitləri saxlayır — ssenarini başqa
rayona köçürmək üçün yalnız bu faylı dəyişmək kifayətdir.

## Layer slot-ları

Mapbox Standard style üç insertion slot təqdim edir. Yeni layer əlavə edərkən
`SLOTS` sabitindən istifadə et, əks halda layer bütün etiketlərin üstündə çıxır:

| Slot | Nə üçün |
|---|---|
| `bottom` | Daşqın poliqonları, su səviyyəsinin qalxması |
| `middle` | Heatmap, hadisə zonaları |
| `top` | Xilasetmə briqadaları, marşrutlar, marker-lər |

## Roadmap (@Rasul)

- [x] **Həftə 1-2** — 3D Al-Majaz baza xəritəsi
- [ ] **Həftə 3-4** — 3D dinamik heatmap + su səviyyəsi effekti
- [ ] **Həftə 5-6** — React dashboard skeleti və Emergency Panel
- [ ] **Həftə 7** — WebSocket real-time inteqrasiyası (@Ali ilə)
- [ ] **Həftə 7** — Avtonom təsdiq/bildiriş modal UI (@Nurlan ilə)

## Əmrlər

| Əmr | Nə edir |
|---|---|
| `npm run dev` | Dev server (http://localhost:5173) |
| `npm run build` | TypeScript yoxlaması + production build |
| `npm run lint` | oxlint |
| `npm run preview` | Build-in lokal önizləməsi |
