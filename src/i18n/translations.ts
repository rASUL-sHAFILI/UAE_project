/**
 * Every string the interface shows, in both languages.
 *
 * The dashboard is presented to judges in English and demonstrated to the team
 * in Azerbaijani, so no user-visible text is written inline in a component.
 * Adding a string means adding it here first; a missing translation shows its
 * key, which is loud enough to catch in review but harmless on stage.
 */

export const LANGUAGES = ['az', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  az: 'AZ',
  en: 'EN',
}

/** Locale used for dates and numbers, per language. */
export const LOCALES: Record<Language, string> = {
  az: 'az-AZ',
  en: 'en-GB',
}

type Entry = Record<Language, string>

export const TRANSLATIONS = {
  'app.title': {
    az: 'Al-Majaz Fövqəladə Hal Mərkəzi',
    en: 'Al-Majaz Emergency Response',
  },
  'app.subtitle': {
    az: 'Şarja, BAE · Daşqın və fövqəladə hal idarəetməsi',
    en: 'Sharjah, UAE · Flood and emergency response',
  },
  'app.phase': {
    az: 'Demo ssenarisi',
    en: 'Demo scenario',
  },
  'app.language': {
    az: 'Dil',
    en: 'Language',
  },

  'map.light.dawn': { az: 'Səhər', en: 'Dawn' },
  'map.light.day': { az: 'Gündüz', en: 'Day' },
  'map.light.dusk': { az: 'Qürub', en: 'Dusk' },
  'map.light.night': { az: 'Gecə', en: 'Night' },
  'map.lighting': { az: 'İşıqlandırma', en: 'Lighting' },
  'map.resetView': { az: 'Al-Majaz görünüşünə qayıt', en: 'Reset to Al-Majaz view' },

  'clock.play': { az: 'Oynat', en: 'Play' },
  'clock.pause': { az: 'Dayandır', en: 'Pause' },
  'clock.reset': { az: 'Sıfırla', en: 'Reset' },
  'clock.timeline': { az: 'Ssenari vaxtı', en: 'Scenario time' },
  'clock.speed': { az: 'Sürət', en: 'Speed' },
  'clock.peakDepth': { az: 'Ən dərin su', en: 'Peak depth' },
  'clock.floodedArea': { az: 'Su altında', en: 'Flooded area' },

  'token.title': { az: 'Mapbox token tapılmadı', en: 'Mapbox token not found' },
  'token.step1': {
    az: 'account.mapbox.com ünvanından public token götür.',
    en: 'Get a public token from account.mapbox.com.',
  },
  'token.step2': {
    az: 'Layihənin kökündə .env.local faylı yarat.',
    en: 'Create a .env.local file in the project root.',
  },
  'token.step3': {
    az: 'İçinə yaz: VITE_MAPBOX_TOKEN=pk.xxxxx',
    en: 'Add the line: VITE_MAPBOX_TOKEN=pk.xxxxx',
  },
  'token.step4': {
    az: 'npm run dev əmrini yenidən işə sal.',
    en: 'Restart npm run dev.',
  },
  'panel.incidents': { az: 'Hadisələr', en: 'Incidents' },
  'panel.units': { az: 'Briqadalar', en: 'Units' },
  'panel.open': { az: 'Açıq', en: 'Open' },
  'panel.critical': { az: 'Kritik', en: 'Critical' },
  'panel.resolved': { az: 'Bağlanıb', en: 'Resolved' },
  'panel.available': { az: 'Hazır', en: 'Available' },
  'panel.people': { az: 'Təsirlənən', en: 'People affected' },
  'panel.empty': {
    az: 'Hələ çağırış yoxdur. Ssenarini oynat.',
    en: 'No calls yet. Start the scenario.',
  },
  'panel.eta': { az: 'Çatma', en: 'ETA' },
  'panel.unassigned': { az: 'Təyin olunmayıb', en: 'Unassigned' },
  'panel.roadCut': {
    az: 'Su səviyyəsi yol nəqliyyatı üçün keçilməzdir',
    en: 'Water depth impassable for road vehicles',
  },

  'status.pending': { az: 'Gözləyir', en: 'Pending' },
  'status.assigned': { az: 'Yerindədir', en: 'On scene' },
  'status.en_route': { az: 'Yoldadır', en: 'En route' },
  'status.resolved': { az: 'Bağlandı', en: 'Resolved' },

  'kind.flood': { az: 'Daşqın', en: 'Flood' },
  'kind.traffic': { az: 'Nəqliyyat', en: 'Traffic' },
  'kind.medical': { az: 'Tibbi', en: 'Medical' },
  'kind.fire': { az: 'Yanğın', en: 'Fire' },
  'kind.rescue': { az: 'Xilasetmə', en: 'Rescue' },

  'unit.ambulance': { az: 'Təcili yardım', en: 'Ambulance' },
  'unit.fire_truck': { az: 'Yanğınsöndürən', en: 'Fire truck' },
  'unit.police': { az: 'Polis', en: 'Police' },
  'unit.rescue_boat': { az: 'Xilasetmə qayığı', en: 'Rescue boat' },

  'unitStatus.available': { az: 'Boşdur', en: 'Available' },
  'unitStatus.dispatched': { az: 'Yoldadır', en: 'En route' },
  'unitStatus.busy': { az: 'Hadisədədir', en: 'On scene' },
} as const satisfies Record<string, Entry>

export type TranslationKey = keyof typeof TRANSLATIONS
