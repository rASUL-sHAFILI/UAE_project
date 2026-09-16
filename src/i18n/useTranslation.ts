import { create } from 'zustand'

import {
  LANGUAGES,
  LOCALES,
  TRANSLATIONS,
  type Language,
  type TranslationKey,
} from './translations'

const STORAGE_KEY = 'al-majaz.language'

/**
 * The language the presenter last chose.
 *
 * Reading storage can throw in a private window or when site data is blocked,
 * and the dashboard must still open, so a failure here just means the default.
 */
function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LANGUAGES as readonly string[]).includes(stored)) {
      return stored as Language
    }
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 'en'
}

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

const INITIAL_LANGUAGE = readStoredLanguage()

// Keep the document in step from the first paint. `text-transform: uppercase`
// follows the document language, and under `lang="az"` an English "Units"
// uppercases to "UNİTS" — the dotted capital is correct Azerbaijani and wrong
// for the word on screen.
document.documentElement.lang = INITIAL_LANGUAGE

const useLanguageStore = create<LanguageState>((set) => ({
  language: INITIAL_LANGUAGE,
  setLanguage: (language) => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    document.documentElement.lang = language
    set({ language })
  },
}))

/**
 * Translation for the current language, plus the tools to read and change it.
 *
 * `t` is a plain lookup rather than a formatter: anything that needs a number
 * or a date formats it with `locale` and interpolates itself, which keeps the
 * dictionary free of placeholder syntax.
 */
export function useTranslation() {
  const language = useLanguageStore((state) => state.language)
  const setLanguage = useLanguageStore((state) => state.setLanguage)

  const t = (key: TranslationKey): string => TRANSLATIONS[key]?.[language] ?? key

  return { t, language, setLanguage, locale: LOCALES[language] }
}
