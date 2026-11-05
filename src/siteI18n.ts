import i18next from 'i18next'

const storageKey = 'baakio-preview-language'
const textElements = Array.from(document.querySelectorAll<HTMLElement>('[data-en][data-hi]'))
const english = Object.fromEntries(textElements.map((element, index) => [
  `site-copy-${index}`,
  element.dataset.en || '',
]))
const hindi = Object.fromEntries(textElements.map((element, index) => [
  `site-copy-${index}`,
  element.dataset.hi || '',
]))
const siteI18n = i18next.createInstance()

declare global {
  interface Window {
    baakioI18n: typeof siteI18n
    baakioI18nReady: Promise<void>
    baakioSetLanguage: (language: string) => Promise<void>
  }
}

function storedLanguage(): 'en-IN' | 'hi-IN' {
  try {
    if (localStorage.getItem('baakio-locale') === 'hi-IN') return 'hi-IN'
    if (localStorage.getItem('baakio-locale') === 'en-IN') return 'en-IN'
    return localStorage.getItem(storageKey) === 'hi' ? 'hi-IN' : 'en-IN'
  } catch {
    return 'en-IN'
  }
}

async function setLanguage(language: string): Promise<void> {
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN'
  await siteI18n.changeLanguage(locale)
  document.documentElement.lang = locale
  textElements.forEach((element, index) => {
    element.textContent = siteI18n.t(`site-copy-${index}`)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-set-lang]').forEach((button) => {
    const active = button.dataset.setLang === language
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll<HTMLElement>('[data-only-lang]').forEach((element) => {
    element.hidden = element.dataset.onlyLang !== language
  })
  document.querySelectorAll<HTMLAnchorElement>('[data-en-href][data-hi-href]').forEach((link) => {
    link.setAttribute('href', language === 'hi' ? link.dataset.hiHref || '' : link.dataset.enHref || '')
  })
  try {
    localStorage.setItem(storageKey, language)
    localStorage.setItem('baakio-locale', locale)
  } catch {
    // Keep language switching available when browser storage is disabled.
  }
}

function setupMenu() {
  const menu = document.getElementById('menu-button')
  const links = document.getElementById('nav-links')
  if (!menu || !links) return

  menu.addEventListener('click', () => {
    const open = links.classList.toggle('open')
    menu.setAttribute('aria-expanded', String(open))
    menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  })
  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      links.classList.remove('open')
      menu.setAttribute('aria-expanded', 'false')
    })
  })
}

const locale = storedLanguage()
window.baakioI18n = siteI18n
window.baakioSetLanguage = setLanguage
window.baakioI18nReady = siteI18n.init({
  resources: {
    'en-IN': { translation: english },
    'hi-IN': { translation: hindi },
  },
  lng: locale,
  fallbackLng: 'en-IN',
  supportedLngs: ['en-IN', 'hi-IN'],
  load: 'currentOnly',
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
}).then(async () => {
  document.querySelectorAll<HTMLButtonElement>('[data-set-lang]').forEach((button) => {
    button.addEventListener('click', () => { void setLanguage(button.dataset.setLang || 'en') })
  })
  setupMenu()
  await setLanguage(locale === 'hi-IN' ? 'hi' : 'en')
})
