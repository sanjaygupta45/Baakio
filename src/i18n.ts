import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translations } from './locales'
import type { Locale } from './types'

export function getStoredLocale(): Locale {
  try {
    if (localStorage.getItem('baakio-locale') === 'hi-IN') return 'hi-IN'
    if (localStorage.getItem('baakio-locale') === 'en-IN') return 'en-IN'
    return localStorage.getItem('baakio-preview-language') === 'hi' ? 'hi-IN' : 'en-IN'
  } catch {
    return 'en-IN'
  }
}

export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem('baakio-locale', locale)
    localStorage.setItem('baakio-preview-language', locale === 'hi-IN' ? 'hi' : 'en')
  } catch {
    // Keep language changes available when browser storage is disabled.
  }
}

const initialLocale = getStoredLocale()

export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: {
      'en-IN': { translation: translations['en-IN'] },
      'hi-IN': { translation: translations['hi-IN'] },
    },
    lng: initialLocale,
    fallbackLng: 'en-IN',
    supportedLngs: ['en-IN', 'hi-IN'],
    load: 'currentOnly',
    interpolation: { escapeValue: false },
    returnNull: false,
  })

export default i18n
