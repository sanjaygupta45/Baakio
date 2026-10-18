import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, newIdempotencyKey, query } from './api'
import GoogleSignInButton from './GoogleSignInButton'
import i18n, { getStoredLocale, storeLocale } from './i18n'
import { errorTranslation } from './locales'
import type { TranslationKey } from './locales'
import type {
  Business,
  Commitment,
  Customer,
  CustomerPage,
  Dashboard,
  Ledger,
  Locale,
  PaymentRecord,
  PurchasePage,
  PurchaseRecord,
  ReminderPreview,
  AccountHolder,
  ScanStatus,
  ScanUpload,
} from './types'
import { ApiError } from './types'
import LandingPage from './LandingPage'

type Page = 'home' | 'customers' | 'scan' | 'followUps' | 'settings' | 'account' | 'newCustomer' | 'purchase' | 'payment' | 'promise' | 'reschedule' | 'opening' | 'reminder'
type AccountTab = 'activity' | 'promises' | 'statement'
type AuthPurpose = 'LOGIN' | 'REGISTER'
interface AuthConfig { googleClientId: string; emailEnabled: boolean; legacyPhoneEnabled: boolean }

const todayInIndia = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '01'
  return `${part('year')}-${part('month')}-${part('day')}`
}

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`
const yesterdayInIndia = () => {
  const date = new Date(`${todayInIndia()}T12:00:00+05:30`)
  date.setUTCDate(date.getUTCDate() - 1)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => part.value).join('-')
}
async function listAllCustomers(): Promise<Customer[]> {
  const first = await api.get<CustomerPage>(`/api/v1/customers${query({ page: 0, size: 50 })}`)
  const items = [...first.items]
  for (let page = 1; items.length < first.total; page += 1) {
    const next = await api.get<CustomerPage>(`/api/v1/customers${query({ page, size: 50 })}`)
    items.push(...next.items)
    if (!next.items.length) break
  }
  return items
}
async function listAllPurchases(customerId: number): Promise<PurchaseRecord[]> {
  const first = await api.get<PurchasePage>(`/api/v1/customers/${customerId}/purchases${query({ page: 0, size: 50 })}`)
  const items = [...first.items]
  for (let page = 1; items.length < first.total; page += 1) {
    const next = await api.get<PurchasePage>(`/api/v1/customers/${customerId}/purchases${query({ page, size: 50 })}`)
    items.push(...next.items)
    if (!next.items.length) break
  }
  return items
}
const formatter = (locale: Locale) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
})
const money = (value: string | number, locale: Locale) => formatter(locale).format(String(value || '0') as unknown as number)
const moneyFromMinor = (value: bigint, locale: Locale) => {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const amount = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
  return formatter(locale).format(`${negative ? '-' : ''}${amount}` as unknown as number)
}
const majorFromMinor = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
const minorUnits = (value: string | number) => {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(String(value).trim())
  if (!match) return 0n
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0').slice(0, 2) || '0')
}
const milliUnits = (value: string) => {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim())
  if (!match) return 0n
  return BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0').slice(0, 3) || '0')
}
const itemLineMinor = (quantity: string, price: string) => (milliUnits(quantity) * minorUnits(price) + 500n) / 1000n
const dateText = (value: string, locale: Locale) => {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(new Date(`${value}T12:00:00+05:30`))
}
const errorKey = (error: unknown): TranslationKey => {
  if (error instanceof ApiError) return errorTranslation[error.code] || 'errorGeneric'
  return 'errorGeneric'
}
const amountValue = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0
const labelsForStatus: Record<string, TranslationKey> = {
  OVERDUE: 'statusOverdue', DUE_TODAY: 'statusToday', UPCOMING: 'statusUpcoming', FULFILLED: 'statusFulfilled',
}

interface SharedProps {
  locale: Locale
  t: (key: TranslationKey) => string
  notify: (message: string, error?: boolean) => void
  onSaved: (message: string) => void
  openCustomer: (customer: Customer) => void
  accountHolder: AccountHolder
  selectedCustomer: Customer | null
  refreshKey: number
}

export default function App() {
  const [accountHolder, setAccountHolder] = useState<AccountHolder | null>(null)
  const [locale, setLocale] = useState<Locale>(getStoredLocale)
  const { t: translate } = useTranslation()
  const isAppEntry = window.location.pathname.endsWith('/app.html')
  const [page, setPage] = useState<Page>('home')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedPromise, setSelectedPromise] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [authPurpose, setAuthPurpose] = useState<AuthPurpose>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'register' ? 'REGISTER' : 'LOGIN',
  )
  const [booting, setBooting] = useState(true)
  const [localeChosenBeforeLogin, setLocaleChosenBeforeLogin] = useState(false)
  const t = useCallback((key: TranslationKey) => translate(key), [translate])

  useEffect(() => {
    document.documentElement.lang = locale === 'hi-IN' ? 'hi' : 'en'
  }, [locale])

  useEffect(() => {
    api.get<AccountHolder>('/api/v1/account-holder').then(async (currentAccountHolder) => {
      const preferredLocale = currentAccountHolder.preferredLocale || locale
      await i18n.changeLanguage(preferredLocale)
      setAccountHolder(currentAccountHolder)
      setLocale(preferredLocale)
      storeLocale(preferredLocale)
    }).catch(() => setAccountHolder(null)).finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = useCallback((message: string, error = false) => setToast({ message, error }), [])
  const startLogin = () => { setAuthPurpose('LOGIN'); setShowLogin(true) }
  const startRegistration = () => { setAuthPurpose('REGISTER'); setShowLogin(true) }
  const onSaved = useCallback((message: string) => {
    setRefreshKey((value) => value + 1)
    setToast({ message, error: false })
    setPage('account')
  }, [])

  const openCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer)
    setPage('account')
  }, [])

  const changeLocale = async (next: Locale) => {
    if (!accountHolder) {
      await i18n.changeLanguage(next)
      setLocale(next)
      setLocaleChosenBeforeLogin(true)
      storeLocale(next)
      return
    }
    try {
      await api.patch('/api/v1/account-holder/preferences', { preferredLocale: next })
      await i18n.changeLanguage(next)
      setLocale(next)
      storeLocale(next)
      setAccountHolder({ ...accountHolder, preferredLocale: next })
    } catch (error) {
      notify(i18n.getFixedT(next)(errorKey(error)), true)
    }
  }

  const signIn = async (signedInAccountHolder: AccountHolder) => {
    const selectedLocale = localeChosenBeforeLogin ? locale : signedInAccountHolder.preferredLocale || locale
    await i18n.changeLanguage(selectedLocale)
    const signedInAccountHolderWithLocale = { ...signedInAccountHolder, preferredLocale: selectedLocale }
    setAccountHolder(signedInAccountHolderWithLocale)
    setShowLogin(false)
    setLocale(selectedLocale)
    storeLocale(selectedLocale)
    if (selectedLocale !== signedInAccountHolder.preferredLocale) {
      void api.patch('/api/v1/account-holder/preferences', { preferredLocale: selectedLocale }).catch(() => notify(i18n.getFixedT(selectedLocale)('errorGeneric'), true))
    }
    setLocaleChosenBeforeLogin(false)
    setPage('home')
  }

  const shared: SharedProps = { locale, t, notify, onSaved, openCustomer, accountHolder: accountHolder!, selectedCustomer, refreshKey }

  if (!accountHolder && booting && !showLogin && !isAppEntry) return <LandingPage locale={locale} onLocaleChange={changeLocale} onLogin={startLogin} onRegister={startRegistration} />
  if (booting) return <div className="loading-screen" role="status">{t('loading')}</div>
  if (!accountHolder) {
    if (showLogin || isAppEntry) return <LoginScreen locale={locale} t={t} notify={notify} initialPurpose={authPurpose} onSignIn={signIn} onLocale={changeLocale} onBack={() => { if (isAppEntry) window.location.assign('/'); else setShowLogin(false) }} />
    return <LandingPage locale={locale} onLocaleChange={changeLocale} onLogin={startLogin} onRegister={startRegistration} />
  }

  const pageTitle: Record<Page, TranslationKey> = {
    home: 'home', customers: 'customers', scan: 'scanTitle', followUps: 'followUpTitle', settings: 'settings',
    account: 'customerAccount', newCustomer: 'createCustomer', purchase: 'addPurchase', payment: 'recordPayment',
    promise: 'addPromise', reschedule: 'reschedule', opening: 'setOpeningBalance', reminder: 'reminderTitle',
  }
  const navPage = page === 'account' || page === 'newCustomer' || page === 'purchase' || page === 'payment' || page === 'promise' || page === 'opening' || page === 'reschedule' || page === 'reminder' ? 'customers' : page
  const sharedWithSelected = { ...shared, selectedCustomer }

  const navigationItems: [Page, string, TranslationKey][] = [
    ['home', '⌂', 'home'], ['customers', '♙', 'customers'], ['scan', '▣', 'scan'], ['followUps', '◷', 'followUps'],
  ]

  return <div className="desktop-layout app-layout">
    <aside className="desktop-aside app-sidebar" aria-label={t('descriptor')}>
      <div className="brand brand-on-dark"><img src="/brand/baakio-icon.png" alt="" /><span>baakio</span></div>
      <div className="app-sidebar-shop">{accountHolder.businessName}</div>
      <nav className="app-sidebar-nav" aria-label={t('descriptor')}>
        {navigationItems.map(([target, icon, label]) => <button key={target}
          className={`app-sidebar-link ${navPage === target ? 'active' : ''}`} type="button" aria-current={navPage === target ? 'page' : undefined} onClick={() => setPage(target)}>
          <span aria-hidden="true">{icon}</span>{t(label)}
        </button>)}
        <button className={`app-sidebar-link ${page === 'settings' ? 'active' : ''}`} type="button" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>
          <span aria-hidden="true">⚙</span>{t('settings')}
        </button>
      </nav>
    </aside>
    <div className="app-frame app-shell">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand-block">
            <div className="brand brand-on-dark"><img src="/brand/baakio-icon.png" alt="" /><span>baakio</span></div>
            <div className="identity">{accountHolder.businessName} · {t('descriptor')}</div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" type="button" onClick={() => void changeLocale(locale === 'en-IN' ? 'hi-IN' : 'en-IN')} aria-label={t('appLanguage')}>
              {locale === 'en-IN' ? 'हिन्दी' : 'English'}
            </button>
            <button className="icon-btn" type="button" onClick={() => setPage('settings')} aria-label={t('settings')}>⚙</button>
          </div>
        </div>
        <div className="page-heading">
          <div>
            {page !== 'home' && page !== 'customers' && page !== 'followUps' && page !== 'scan' && page !== 'settings' &&
              <button className="back-btn" type="button" onClick={() => setPage(page === 'account' || page === 'newCustomer' ? 'customers' : 'account')}>{t('back')}</button>}
            <h1>{page === 'home' ? t('goodMorning') : page === 'account' && selectedCustomer ? selectedCustomer.displayName : t(pageTitle[page])}</h1>
            {(page === 'home' || page === 'account') && <p>{page === 'home' ? t('homeSubhead') : t('customerAccount')}</p>}
          </div>
        </div>
      </header>

      <main className="screen" key={page}>
        {page === 'home' && <HomePage {...sharedWithSelected} onNavigate={setPage} />}
        {page === 'customers' && <CustomersPage {...sharedWithSelected} onNavigate={setPage} />}
        {page === 'account' && selectedCustomer && <AccountPage {...sharedWithSelected} onNavigate={setPage} onPromise={setSelectedPromise} />}
        {page === 'newCustomer' && <NewCustomerPage {...sharedWithSelected} onCancel={() => setPage('customers')} />}
        {page === 'purchase' && selectedCustomer && <PurchasePage {...sharedWithSelected} customer={selectedCustomer} />}
        {page === 'payment' && selectedCustomer && <PaymentPage {...sharedWithSelected} customer={selectedCustomer} commitmentId={selectedPromise} />}
        {page === 'promise' && selectedCustomer && <PromisePage {...sharedWithSelected} customer={selectedCustomer} />}
        {page === 'reschedule' && selectedPromise !== null && <ReschedulePage {...sharedWithSelected} commitmentId={selectedPromise} />}
        {page === 'opening' && selectedCustomer && <OpeningBalancePage {...sharedWithSelected} customer={selectedCustomer} />}
        {page === 'followUps' && <FollowUpsPage {...sharedWithSelected} />}
        {page === 'reminder' && selectedCustomer && <ReminderPage {...sharedWithSelected} customer={selectedCustomer} />}
        {page === 'settings' && <SettingsPage {...sharedWithSelected} onLocaleChange={changeLocale} onSignedOut={() => { setAccountHolder(null); setPage('home'); setShowLogin(false); setAuthPurpose('LOGIN') }} />}
        {page === 'scan' && <ScanPage {...sharedWithSelected} onNavigate={setPage} />}
      </main>

      <nav className="bottom-nav" aria-label={t('descriptor')}>
        {navigationItems.map(([target, icon, label]) => <button key={target}
          className={`nav-item ${navPage === target ? 'active' : ''}`} type="button" onClick={() => setPage(target)}>
          <span className="nav-icon" aria-hidden="true">{icon}</span><span>{t(label)}</span>
        </button>)}
      </nav>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.message}</div>}
    </div>
  </div>
}

function IndiaPhoneInput({ id, value, onChange, required = false }: {
  id: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return <div className="phone-input">
    <span className="phone-prefix" aria-label="India country code +91"><span aria-hidden="true">🇮🇳</span><span>+91</span></span>
    <input
      className="control"
      id={id}
      autoComplete="tel-national"
      inputMode="numeric"
      type="tel"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 10))}
      onPaste={(event) => {
        const digits = event.clipboardData.getData('text').replace(/\D/g, '')
        const hasIndiaPrefix = digits.length === 12 && digits.startsWith('91')
        const hasIndiaTrunkPrefix = digits.length === 11 && digits.startsWith('0')
        if (digits.length === 10 || hasIndiaPrefix || hasIndiaTrunkPrefix) {
          event.preventDefault()
          onChange((hasIndiaPrefix ? digits.slice(2) : hasIndiaTrunkPrefix ? digits.slice(1) : digits).slice(0, 10))
        }
      }}
      required={required}
      pattern="[6-9][0-9]{9}"
      maxLength={10}
    />
  </div>
}

function LoginScreen({ locale, t, notify, initialPurpose, onSignIn, onLocale, onBack }: Pick<SharedProps, 'locale' | 't' | 'notify'> & {
  initialPurpose: AuthPurpose; onSignIn: (accountHolder: AccountHolder) => void; onLocale: (locale: Locale) => void; onBack: () => void
}) {
  const [purpose, setPurpose] = useState<AuthPurpose>(initialPurpose)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [developmentCode, setDevelopmentCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    api.get<AuthConfig>('/api/v1/auth/config').then(setConfig).catch(() => setErrorMessage(t('errorGeneric')))
  }, [t])

  useEffect(() => {
    if (!resendAt) return
    const updateCountdown = () => setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)))
    updateCountdown()
    const timer = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])

  const showError = (error: unknown) => {
    const message = t(errorKey(error))
    setErrorMessage(message)
    notify(message, true)
  }

  const requestCode = async () => {
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await api.post<{ challengeId: string; expiresInSeconds: number; resendAfterSeconds: number; developmentCode?: string }>(
        '/api/v1/auth/email/request', { email: email.trim(), purpose, preferredLocale: locale },
      )
      setChallengeId(response.challengeId)
      setDevelopmentCode(response.developmentCode || '')
      setOtp('')
      setResendAt(Date.now() + response.resendAfterSeconds * 1000)
      setStep('code')
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step === 'email') { await requestCode(); return }
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await api.post<{ accountHolder: AccountHolder }>(
        `/api/v1/auth/email/${purpose === 'LOGIN' ? 'login' : 'register'}`,
        { email: email.trim(), challengeId, otp, displayName: displayName.trim(),
          businessName: businessName.trim(), preferredLocale: locale },
      )
      onSignIn(response.accountHolder)
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const googleCredential = async (idToken: string) => {
    if (purpose === 'REGISTER' && (!displayName.trim() || !businessName.trim())) {
      setErrorMessage(t('required'))
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await api.post<{ accountHolder: AccountHolder }>('/api/v1/auth/google', {
        idToken, displayName: displayName.trim(), businessName: purpose === 'REGISTER' ? businessName.trim() : null,
        preferredLocale: locale,
      })
      onSignIn(response.accountHolder)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REGISTRATION_DETAILS_REQUIRED') setPurpose('REGISTER')
      showError(error)
    } finally { setBusy(false) }
  }

  const changeEmail = () => {
    setStep('email')
    setChallengeId('')
    setOtp('')
    setDevelopmentCode('')
    setErrorMessage('')
  }

  return <div className="desktop-layout auth-layout">
    <aside className="desktop-aside auth-aside">
      <img className="desktop-wordmark" src="/brand/baakio-logo.png" alt="Baakio" />
      <div className="eyebrow">{t('descriptor')}</div>
      <h2>{t('tagline')}</h2>
      <ul className="auth-benefits">
        <li><span aria-hidden="true">✓</span>{t('customers')}</li>
        <li><span aria-hidden="true">✓</span>{t('recordPayment')}</li>
        <li><span aria-hidden="true">✓</span>{t('followUpTitle')}</li>
      </ul>
    </aside>
    <div className="app-frame auth-shell">
      <header className="topbar"><div className="topbar-row"><div className="brand brand-on-dark"><img src="/brand/baakio-icon.png" alt="" /><span>baakio</span></div>
        <div className="auth-top-actions">
          <button className="icon-btn" type="button" onClick={onBack}>{t('back')}</button>
          <button className="icon-btn" type="button" onClick={() => onLocale(locale === 'en-IN' ? 'hi-IN' : 'en-IN')}>{locale === 'en-IN' ? 'हिन्दी' : 'English'}</button>
        </div></div>
        <div className="page-heading"><div><h1>{step === 'code' ? t('verifyCode') : purpose === 'LOGIN' ? t('signIn') : t('registerTitle')}</h1><p>{t('descriptor')}</p></div></div>
      </header>
      <main className="screen">
        <form className="card auth-form" onSubmit={(event) => void submit(event)}>
          {errorMessage && <div className="note error" role="alert">{errorMessage}</div>}
          {step === 'email' ? <>
            <div className="btn-row" role="tablist" aria-label={t('authOptions')}>
              <button className={`btn ${purpose === 'LOGIN' ? '' : 'secondary'}`} type="button" role="tab" aria-selected={purpose === 'LOGIN'} onClick={() => { setPurpose('LOGIN'); setErrorMessage('') }}>{t('signIn')}</button>
              <button className={`btn ${purpose === 'REGISTER' ? '' : 'secondary'}`} type="button" role="tab" aria-selected={purpose === 'REGISTER'} onClick={() => { setPurpose('REGISTER'); setErrorMessage('') }}>{t('createAccount')}</button>
            </div>
            <p className="subtle">{purpose === 'LOGIN' ? t('signInHint') : t('registerHint')}</p>
            {purpose === 'REGISTER' && <>
              <div className="field"><label htmlFor="auth-name">{t('fullName')}</label><input className="control" id="auth-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={160} /></div>
              <div className="field"><label htmlFor="auth-business">{t('shopName')}</label><input className="control" id="auth-business" autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required maxLength={160} /></div>
            </>}
            {config?.googleClientId && <GoogleSignInButton clientId={config.googleClientId} locale={locale} onCredential={(token) => void googleCredential(token)} onError={() => setErrorMessage(t('errorGoogleAuth'))} />}
            {config?.emailEnabled && <>
              {config.googleClientId && <p className="subtle">{t('orEmail')}</p>}
              <div className="field"><label htmlFor="auth-email">{t('email')}</label><input className="control" id="auth-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={190} /></div>
              <button className="btn wide" disabled={busy} type="submit">{busy ? t('loading') : t('sendEmailCode')}</button>
            </>}
            {config && !config.googleClientId && !config.emailEnabled && <div className="note error">{t('errorAuthNotConfigured')}</div>}
          </> : <>
            <p className="subtle">{t('codeSent')} {email} <button className="link-button" type="button" onClick={changeEmail}>{t('changeEmail')}</button></p>
            {developmentCode && <div className="note" role="status">{t('devCodeNotice')} <strong>{developmentCode}</strong></div>}
            <div className="field"><label htmlFor="auth-otp">{t('verificationCode')}</label><input className="control" id="auth-otp" autoComplete="one-time-code" inputMode="numeric" type="text" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} /></div>
            <button className="btn wide" disabled={busy || otp.length !== 6} type="submit">{busy ? t('loading') : purpose === 'LOGIN' ? t('signInButton') : t('finishRegistration')}</button>
            <button className="link-button" type="button" disabled={busy || secondsLeft > 0} onClick={() => void requestCode()}>{secondsLeft > 0 ? `${t('resendCode')} (${secondsLeft})` : t('resendCode')}</button>
          </>}
        </form>
      </main>
    </div>
  </div>
}

function HomePage({ locale, t, notify, openCustomer, onNavigate }: SharedProps & { onNavigate: (page: Page) => void }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    api.get<Dashboard>('/api/v1/dashboard').then(setDashboard).catch((error) => notify(t(errorKey(error)), true)).finally(() => setBusy(false))
  }, [notify, t])
  const customersWithBalance = dashboard?.customersWithOutstanding || 0
  if (busy && !dashboard) return <Loading t={t} />
  return <>
    <section className="card hero-card">
      <div className="eyebrow">{t('totalOutstanding')}</div>
      <div className="big-money">{money(dashboard?.totalOutstanding || '0', locale)}</div>
      <div className="hero-description">{customersWithBalance} {t('customersWithDue').toLocaleLowerCase(locale)}</div>
    </section>
    <div className="grid-two">
      <div className="card metric-card"><div className="metric-label">{t('dueToday')}</div><div className="metric-value">{money(dashboard?.dueTodayAmount || '0', locale)}</div><span className="badge amber">{dashboard?.dueTodayCount || 0} {t('today').toLocaleLowerCase(locale)}</span></div>
      <div className="card metric-card"><div className="metric-label">{t('overdue')}</div><div className="metric-value">{money(dashboard?.overdueAmount || '0', locale)}</div><span className="badge red">{dashboard?.overdueCount || 0} {t('pastDue').toLocaleLowerCase(locale)}</span></div>
    </div>
    <div className="action-grid">
      <button className="btn secondary" type="button" onClick={() => onNavigate('newCustomer')}>＋ {t('addCustomer')}</button>
      <button className="btn" type="button" onClick={() => onNavigate('scan')}>▣ {t('scan')}</button>
    </div>
    <div className="section-row"><h2>{t('customersNeedingAttention')}</h2><button className="link-button" type="button" onClick={() => onNavigate('followUps')}>{t('viewAll')}</button></div>
    {dashboard?.attentionCustomers.length ? dashboard.attentionCustomers.map((customer) => <CustomerRow key={customer.id} customer={customer} locale={locale} t={t} onClick={() => openCustomer(customer)} />) :
      <EmptyState icon="☷" title={t('noCustomers')} detail={t('noCustomersHint')} action={<button className="btn soft" type="button" onClick={() => onNavigate('newCustomer')}>{t('addCustomer')}</button>} />}
    {!!dashboard && dashboard.customersWithoutPromise > 0 && <div className="note">{dashboard.customersWithoutPromise} · {t('withoutPromise')}</div>}
  </>
}

function CustomersPage({ locale, t, notify, openCustomer, onNavigate }: SharedProps & { onNavigate: (page: Page) => void }) {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<CustomerPage | null>(null)
  const [busy, setBusy] = useState(true)
  const [page, setPage] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<CustomerPage>(`/api/v1/customers${query({ search, page, size: 50 })}`)
        .then((response) => setData((current) => page === 0 || !current ? response : { ...response, items: [...current.items, ...response.items] }))
        .catch((error) => notify(t(errorKey(error)), true)).finally(() => { setBusy(false); setLoadingMore(false) })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [search, page, notify])
  const loadMore = () => { setLoadingMore(true); setPage((current) => current + 1) }
  const searchFor = (value: string) => { setSearch(value); setPage(0); setData(null); setBusy(true) }
  return <>
    <div className="field"><label className="sr-only" htmlFor="customer-search">{t('searchCustomers')}</label><input id="customer-search" className="search-input" value={search} onChange={(event) => searchFor(event.target.value)} placeholder={t('searchCustomers')} /></div>
    <div className="section-row"><h2>{t('customerCount')} · {data?.total ?? '…'}</h2><button className="btn mini" type="button" onClick={() => onNavigate('newCustomer')}>＋ {t('addCustomer')}</button></div>
    {busy && !data ? <Loading t={t} /> : data?.items.length ? data.items.map((customer) => <CustomerRow key={customer.id} customer={customer} locale={locale} t={t} onClick={() => openCustomer(customer)} />) :
      <EmptyState icon="⌕" title={search ? t('emptySearch') : t('noCustomers')} detail={search ? '' : t('noCustomersHint')} action={!search ? <button className="btn" type="button" onClick={() => onNavigate('newCustomer')}>{t('addCustomer')}</button> : null} />}
    {data && data.items.length < data.total && <button className="btn secondary wide" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('loading') : t('loadMore')}</button>}
  </>
}

function CustomerRow({ customer, locale, t, onClick }: { customer: Customer; locale: Locale; t: (key: TranslationKey) => string; onClick: () => void }) {
  const promise = customer.nextCommitment
  const statusKey = promise ? labelsForStatus[promise.status] : undefined
  return <button className="customer-row" type="button" onClick={onClick}>
    <span className="person"><span className="avatar" aria-hidden="true">{customer.displayName.trim().charAt(0).toLocaleUpperCase(locale)}</span>
      <span className="person-copy"><span className="person-name">{customer.displayName}</span>
        <span className="person-meta">{promise ? `${statusKey ? t(statusKey) : ''}: ${dateText(promise.dueDate, locale)} · ${money(promise.remaining, locale)}` : t('noActivePromise')}</span></span></span>
    <span className="customer-money">{money(customer.outstanding, locale)}</span>
  </button>
}

function NewCustomerPage({ t, notify, onSaved, onCancel, openCustomer }: SharedProps & { onCancel: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [messageLocale, setMessageLocale] = useState<Locale>('en-IN')
  const [matching, setMatching] = useState<Customer[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (name.trim().length < 2) { setMatching([]); return }
    const timer = window.setTimeout(() => api.get<CustomerPage>(`/api/v1/customers${query({ search: name.trim(), page: 0, size: 10 })}`)
      .then((response) => setMatching(response.items.filter((item) => item.displayName.trim().toLowerCase() === name.trim().toLowerCase()))).catch(() => setMatching([])), 250)
    return () => window.clearTimeout(timer)
  }, [name])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { notify(t('required'), true); return }
    setBusy(true)
    try {
      const customer = await api.post<Customer>('/api/v1/customers', {
        displayName: name.trim(), phoneE164: phone ? `+91${phone}` : null, notes: notes.trim() || null, preferredMessageLocale: messageLocale,
      })
      notify(t('savedCustomer'))
      openCustomer(customer)
      onSaved(t('savedCustomer'))
    } catch (error) {
      notify(t(errorKey(error)), true)
    } finally { setBusy(false) }
  }
  return <form className="card" onSubmit={(event) => void submit(event)}>
    {matching.length > 0 && <div className="note warn">{t('duplicateWarning')} {matching.map((item) => item.phoneE164).filter(Boolean).join(', ')}</div>}
    <div className="field"><label htmlFor="new-customer-name">{t('customerName')}</label><input id="new-customer-name" className="control" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} autoFocus /></div>
    <div className="field"><label htmlFor="new-customer-phone">{t('phone')}</label><IndiaPhoneInput id="new-customer-phone" value={phone} onChange={setPhone} /></div>
    <div className="field"><label htmlFor="new-customer-language">{t('preferredLanguage')}</label><select id="new-customer-language" className="control" value={messageLocale} onChange={(event) => setMessageLocale(event.target.value as Locale)}><option value="en-IN">English</option><option value="hi-IN">हिन्दी</option></select></div>
    <div className="field"><label htmlFor="new-customer-notes">{t('notes')}</label><textarea id="new-customer-notes" className="control" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></div>
    <div className="btn-row"><button className="btn secondary" type="button" onClick={onCancel}>{t('cancel')}</button><button className="btn" type="submit" disabled={busy}>{busy ? t('saving') : t('saveCustomer')}</button></div>
  </form>
}

function AccountPage({ locale, t, notify, selectedCustomer, refreshKey, onNavigate, onPromise }: SharedProps & {
  onNavigate: (page: Page) => void; onPromise: (id: number | null) => void
}) {
  const [customer, setCustomer] = useState<Customer | null>(selectedCustomer)
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [tab, setTab] = useState<AccountTab>('activity')
  useEffect(() => {
    if (!selectedCustomer) return
    const customerUrl = `/api/v1/customers/${selectedCustomer.id}`
    Promise.all([
      api.get<Customer>(customerUrl),
      api.get<Ledger>(`${customerUrl}/ledger${query({ from: '1900-01-01', to: todayInIndia() })}`),
      api.get<Commitment[]>(`${customerUrl}/commitments`),
      listAllPurchases(selectedCustomer.id),
      api.get<PaymentRecord[]>(`${customerUrl}/payments`),
    ]).then(([current, history, promises, purchaseHistory, paymentHistory]) => {
      setCustomer(current); setLedger(history); setCommitments(promises); setPurchases(purchaseHistory); setPayments(paymentHistory)
    })
      .catch((error) => notify(t(errorKey(error)), true))
  }, [selectedCustomer?.id, refreshKey, notify, t])
  if (!selectedCustomer) return <EmptyState icon="⌕" title={t('noCustomers')} detail={t('noCustomersHint')} />
  if (!customer || !ledger) return <Loading t={t} />
  const nearest = commitments.find((item) => Number(item.remaining) > 0 && item.status !== 'FULFILLED')
  const hasBalance = minorUnits(customer.outstanding) > 0n
  return <>
    <section className="card hero-card">
      <div className="eyebrow">{t('balance')}</div><div className="big-money">{money(customer.outstanding, locale)}</div>
      <div className="hero-description">{customer.displayName}</div>
    </section>
    <div className="grid-two">
      <div className="card metric-card"><div className="metric-label">{t('totalPurchases')}</div><div className="metric-value">{money(customer.totalPurchases, locale)}</div></div>
      <div className="card metric-card"><div className="metric-label">{t('totalPaid')}</div><div className="metric-value">{money(customer.totalPaid, locale)}</div></div>
    </div>
    {nearest && <div className="card">
      <div className="status-line"><div className="eyebrow">{t('nextPromise')}</div><StatusBadge status={nearest.status} t={t} /></div>
      <div className="status-line" style={{ marginTop: 8 }}><strong style={{ fontSize: 21 }}>{money(nearest.remaining, locale)}</strong><span className="subtle">{dateText(nearest.dueDate, locale)}</span></div>
    </div>}
    {!hasBalance && <div className="note">{t('settled')}</div>}
    <div className="action-grid">
      <button className="btn" type="button" onClick={() => onNavigate('purchase')}>＋ {t('addPurchase')}</button>
      <button className="btn secondary" type="button" disabled={!hasBalance} onClick={() => { onPromise(null); onNavigate('payment') }}>− {t('recordPayment')}</button>
      <button className="btn soft span-two" type="button" onClick={() => onNavigate('scan')}>▣ {t('scanBillFromAccount')}</button>
      <button className="btn soft span-two" type="button" disabled={!hasBalance} onClick={() => onNavigate('promise')}>◷ {t('addPromise')}</button>
      <button className="btn secondary span-two" type="button" onClick={() => onNavigate('reminder')}>{t('shareReminder')}</button>
    </div>
    {!customer.openingBalanceSet && <div className="note"><strong>{t('openingBalance')}</strong><div className="subtle">{t('openingBalanceHint')}</div><button className="link-button" type="button" onClick={() => onNavigate('opening')}>{t('setOpeningBalance')} →</button></div>}
    <div className="section-row"><h2>{t('customerAccount')}</h2></div>
    <div className="choice-row" role="tablist">
      {(['activity', 'promises', 'statement'] as AccountTab[]).map((item) => <button className={`choice ${tab === item ? 'active' : ''}`} role="tab" aria-selected={tab === item} type="button" key={item} onClick={() => setTab(item)}>{t(item)}</button>)}
    </div>
    {tab === 'activity' && <ActivityPanel ledger={{ ...ledger, movements: [
      ...ledger.movements.filter((movement) => movement.type === 'OPENING_BALANCE'),
      ...purchases.map((purchase) => ({ type: 'PURCHASE', id: purchase.id, occurredOn: purchase.occurredOn,
        description: purchase.description || purchase.lines.map((line) => line.name).join(', ') || null,
        amount: purchase.total, direction: 'DEBIT' as const, method: null, postedAt: purchase.postedAt })),
      ...payments.map((payment) => ({ type: 'PAYMENT', id: payment.id, occurredOn: payment.occurredOn,
        description: payment.reference, amount: payment.amount, direction: 'CREDIT' as const,
        method: payment.method, postedAt: payment.postedAt })),
    ] }} locale={locale} t={t} />}
    {tab === 'promises' && <PromisesPanel commitments={commitments} locale={locale} t={t} onReschedule={(id) => { onPromise(id); onNavigate('reschedule') }} onPayment={(id) => { onPromise(id); onNavigate('payment') }} />}
    {tab === 'statement' && <StatementPanel customer={customer} initialLedger={ledger} locale={locale} t={t} notify={notify} />}
  </>
}

function ActivityPanel({ ledger, locale, t }: { ledger: Ledger; locale: Locale; t: (key: TranslationKey) => string }) {
  if (!ledger.movements.length) return <EmptyState icon="☷" title={t('noActivity')} />
  return <section className="card"><div className="eyebrow">{t('activity')}</div>{[...ledger.movements].reverse().map((item) => {
    const positive = item.direction === 'DEBIT'
    const label = item.type === 'PAYMENT' ? t('recordPayment') : item.type === 'OPENING_BALANCE' ? t('openingBalance') : t('addPurchase')
    return <div className="item-row" key={`${item.type}-${item.id}`}>
      <div className="status-line"><div><div className="item-title">{label}</div><div className="item-description">{dateText(item.occurredOn, locale)}{item.method ? ` · ${item.method}` : ''}{item.description ? ` · ${item.description}` : ''}</div></div>
        <strong className={positive ? 'money-positive' : 'money-negative'}>{positive ? '+' : '−'}{money(item.amount, locale)}</strong></div>
    </div>
  })}</section>
}

function PromisesPanel({ commitments, locale, t, onReschedule, onPayment }: {
  commitments: Commitment[]; locale: Locale; t: (key: TranslationKey) => string;
  onReschedule: (id: number) => void; onPayment: (id: number) => void
}) {
  if (!commitments.length) return <EmptyState icon="◷" title={t('noPromises')} />
  return <div>{commitments.map((item) => <section className="card" key={item.id}>
    <div className="status-line"><StatusBadge status={item.status} t={t} /><strong>{money(item.remaining, locale)}</strong></div>
    <div className="split-row"><span>{t('amountPromised')}</span><strong>{money(item.originalAmount, locale)}</strong></div>
    <div className="split-row"><span>{t('dueOn')}</span><strong>{dateText(item.dueDate, locale)}</strong></div>
    {item.originalDueDate !== item.dueDate && <div className="split-row"><span>{t('originalDate')}</span><span>{dateText(item.originalDueDate, locale)}</span></div>}
    {item.revisions.length > 0 && <div className="item-description">{t('promiseHistory')}: {item.revisions.map((revision) => `${dateText(revision.oldDate, locale)} → ${dateText(revision.newDate, locale)}`).join(' · ')}</div>}
    {item.note && <div className="item-description">{item.note}</div>}
    {item.status !== 'FULFILLED' && <div className="btn-row" style={{ marginTop: 12 }}><button className="btn secondary mini" type="button" onClick={() => onReschedule(item.id)}>{t('reschedule')}</button><button className="btn mini" type="button" onClick={() => onPayment(item.id)}>{t('recordPayment')}</button></div>}
  </section>)}</div>
}

function StatementPanel({ customer, initialLedger, locale, t, notify }: {
  customer: Customer; initialLedger: Ledger; locale: Locale; t: (key: TranslationKey) => string; notify: SharedProps['notify']
}) {
  const [from, setFrom] = useState(firstOfMonth(todayInIndia()))
  const [to, setTo] = useState(todayInIndia())
  const [ledger, setLedger] = useState<Ledger>(initialLedger)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try { setLedger(await api.get<Ledger>(`/api/v1/customers/${customer.id}/ledger${query({ from, to })}`)) }
    catch (error) { notify(t(errorKey(error)), true) }
    finally { setBusy(false) }
  }
  return <>
    <form className="card" onSubmit={(event) => void submit(event)}>
      <div className="grid-two"><div className="field"><label htmlFor="statement-from">{t('periodFrom')}</label><input className="control" id="statement-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></div>
        <div className="field"><label htmlFor="statement-to">{t('periodTo')}</label><input className="control" id="statement-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></div></div>
      <button className="btn secondary wide" type="submit" disabled={busy}>{busy ? t('loading') : t('statement')}</button>
    </form>
    <section className="card">
      <Split label={t('openingForPeriod')} value={money(ledger.openingAtFrom, locale)} />
      <Split label={t('purchasesInPeriod')} value={money(ledger.purchasesInPeriod, locale)} />
      <Split label={t('paymentsInPeriod')} value={`−${money(ledger.paymentsInPeriod, locale)}`} />
      <Split label={t('closingBalance')} value={money(ledger.closingAtTo, locale)} total />
      <Split label={t('currentBalance')} value={money(customer.outstanding, locale)} />
    </section>
    {ledger.movements.length > 0 && <ActivityPanel ledger={ledger} locale={locale} t={t} />}
  </>
}

function PurchasePage({ locale, t, notify, onSaved, customer }: SharedProps & { customer: Customer }) {
  const [mode, setMode] = useState<'QUICK' | 'ITEMIZED'>('QUICK')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [discount, setDiscount] = useState('0.00')
  const [occurredOn, setOccurredOn] = useState(todayInIndia())
  const [paidNow, setPaidNow] = useState('')
  const [paidConfirmed, setPaidConfirmed] = useState(false)
  const [paidMethod, setPaidMethod] = useState('CASH')
  const [lines, setLines] = useState([{ name: '', quantity: '1', unit: '', unitPrice: '' }])
  const [busy, setBusy] = useState(false)
  const estimateMinor = mode === 'QUICK' ? minorUnits(amount || 0) : lines.reduce((sum, line) => sum + itemLineMinor(line.quantity || '0', line.unitPrice || '0'), 0n) - minorUnits(discount || 0)
  const updateLine = (index: number, key: keyof typeof lines[number], value: string) => setLines((current) => current.map((line, row) => row === index ? { ...line, [key]: value } : line))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'QUICK' && !amountValue(amount)) { notify(t('invalidAmount'), true); return }
    if (mode === 'ITEMIZED' && lines.some((line) => !line.name.trim() || !amountValue(line.quantity) || line.unitPrice === '' || Number(line.unitPrice) < 0)) { notify(t('required'), true); return }
    if (paidNow && (!amountValue(paidNow) || !paidConfirmed)) { notify(t('required'), true); return }
    setBusy(true)
    const body: Record<string, unknown> = { mode, occurredOn, description: description.trim() || null }
    if (mode === 'QUICK') body.amount = amount
    else {
      body.discount = discount || '0.00'
      body.lines = lines.map((line) => ({ name: line.name.trim(), quantity: line.quantity, unit: line.unit.trim() || null, unitPrice: line.unitPrice }))
    }
    if (paidNow) body.paidNow = { amount: paidNow, method: paidMethod, confirmedByAccountHolder: paidConfirmed }
    try {
      await api.post(`/api/v1/customers/${customer.id}/purchases`, body, newIdempotencyKey())
      onSaved(t('savedPurchase'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  return <form className="card" onSubmit={(event) => void submit(event)}>
    <div className="eyebrow">{customer.displayName} · {t('balance')}</div><strong>{money(customer.outstanding, locale)}</strong>
    <div className="choice-row" style={{ marginTop: 14 }}>{(['QUICK', 'ITEMIZED'] as const).map((item) => <button key={item} className={`choice ${mode === item ? 'active' : ''}`} type="button" onClick={() => setMode(item)}>{t(item === 'QUICK' ? 'quick' : 'itemized')}</button>)}</div>
    {mode === 'QUICK' ? <>
      <div className="field"><label htmlFor="purchase-amount">{t('amount')}</label><input className="control" id="purchase-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
      <div className="field"><label htmlFor="purchase-description">{t('description')}</label><input className="control" id="purchase-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></div>
    </> : <>
      <div className="form-section">{t('itemized')}</div>
      {lines.map((line, index) => <div className="item-line" key={index}>
        <input className="control" aria-label={t('itemName')} placeholder={t('itemName')} value={line.name} onChange={(event) => updateLine(index, 'name', event.target.value)} />
        <input className="control" aria-label={t('quantity')} placeholder="1" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} />
        <input className="control line-unit" aria-label={t('unit')} placeholder={t('unit')} value={line.unit} onChange={(event) => updateLine(index, 'unit', event.target.value)} />
        <input className="control" aria-label={t('unitPrice')} placeholder="₹" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, 'unitPrice', event.target.value)} />
        <button className="remove-line" type="button" aria-label={t('remove')} disabled={lines.length < 2} onClick={() => setLines((current) => current.filter((_, row) => row !== index))}>×</button>
      </div>)}
      <button className="btn soft mini" type="button" onClick={() => setLines((current) => [...current, { name: '', quantity: '1', unit: '', unitPrice: '' }])}>＋ {t('addLine')}</button>
      <div className="field" style={{ marginTop: 13 }}><label htmlFor="purchase-discount">{t('discount')}</label><input className="control" id="purchase-discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
      <div className="field"><label htmlFor="purchase-description-item">{t('description')}</label><input className="control" id="purchase-description-item" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></div>
      <div className="split-row"><span>{t('estimatedTotal')}</span><strong>{moneyFromMinor(estimateMinor, locale)}</strong></div>
    </>}
    <div className="field"><label htmlFor="purchase-date">{t('date')}</label><input className="control" id="purchase-date" type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required /></div>
    <div className="form-section">{t('paidNow')}</div>
    <div className="field"><label htmlFor="paid-now">{t('paidNow')}</label><input className="control" id="paid-now" type="number" min="0" step="0.01" value={paidNow} onChange={(event) => setPaidNow(event.target.value)} /></div>
    {paidNow && <><PaymentMethod value={paidMethod} onChange={setPaidMethod} t={t} /><Check label={t('confirmPaidNow')} checked={paidConfirmed} onChange={setPaidConfirmed} /> </>}
    <div className="note">{t('estimatedTotal')}: {moneyFromMinor(estimateMinor, locale)} · {t('balance')}: {money(customer.outstanding, locale)}</div>
    <button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('savePurchase')}</button>
  </form>
}

function PaymentPage({ locale, t, notify, onSaved, customer, commitmentId }: SharedProps & { customer: Customer; commitmentId: number | null }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [occurredOn, setOccurredOn] = useState(todayInIndia())
  const [reference, setReference] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [allocationId, setAllocationId] = useState(commitmentId ? String(commitmentId) : '')
  const [allocationAmount, setAllocationAmount] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<Commitment[]>(`/api/v1/customers/${customer.id}/commitments`).then(setCommitments).catch(() => setCommitments([])) }, [customer.id])
  useEffect(() => { setAllocationId(commitmentId ? String(commitmentId) : '') }, [commitmentId])
  const active = commitments.filter((item) => Number(item.remaining) > 0 && item.status !== 'FULFILLED')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!amountValue(amount) || !confirmed) { notify(t('required'), true); return }
    const allocations = allocationId && amountValue(allocationAmount) ? [{ commitmentId: Number(allocationId), amount: allocationAmount }] : []
    setBusy(true)
    try {
      await api.post(`/api/v1/customers/${customer.id}/payments`, {
        amount, method, occurredOn, reference: reference.trim() || null, confirmedByAccountHolder: confirmed, allocations,
      }, newIdempotencyKey())
      onSaved(t('savedPayment'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  return <form className="card" onSubmit={(event) => void submit(event)}>
    <div className="eyebrow">{customer.displayName} · {t('balance')}</div><div className="big-money" style={{ fontSize: 29 }}>{money(customer.outstanding, locale)}</div>
    <div className="field"><label htmlFor="payment-amount">{t('amount')}</label><input id="payment-amount" className="control" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); if (!allocationAmount) setAllocationAmount(event.target.value) }} required /></div>
    <PaymentMethod value={method} onChange={setMethod} t={t} />
    <div className="field"><label htmlFor="payment-reference">{t('reference')}</label><input id="payment-reference" className="control" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} /></div>
    <div className="field"><label htmlFor="payment-date">{t('date')}</label><input id="payment-date" className="control" type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required /></div>
    {active.length > 0 && <>
      <div className="form-section">{t('promises')}</div>
      <div className="field"><label htmlFor="payment-commitment">{t('amountPromised')}</label><select id="payment-commitment" className="control" value={allocationId} onChange={(event) => setAllocationId(event.target.value)}><option value="">—</option>{active.map((item) => <option key={item.id} value={item.id}>{money(item.remaining, locale)} · {dateText(item.dueDate, locale)}</option>)}</select></div>
      {allocationId && <div className="field"><label htmlFor="payment-allocation">{t('remainingPromise')}</label><input id="payment-allocation" className="control" type="number" min="0.01" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} /></div>}
    </>}
    <Check label={t('confirmReceived')} checked={confirmed} onChange={setConfirmed} />
    <div className="note">{minorUnits(amount || 0) <= minorUnits(customer.outstanding)
      ? `${t('balance')}: ${money(customer.outstanding, locale)} → ${moneyFromMinor(minorUnits(customer.outstanding) - minorUnits(amount || 0), locale)}`
      : t('paymentTooHigh')}</div>
    <button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('savePayment')}</button>
  </form>
}

function PromisePage({ locale, t, notify, onSaved, customer }: SharedProps & { customer: Customer }) {
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayInIndia())
  const [note, setNote] = useState('')
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<Commitment[]>(`/api/v1/customers/${customer.id}/commitments`).then(setCommitments).catch(() => setCommitments([])) }, [customer.id])
  const unpromisedAmount = commitments.filter((item) => item.status !== 'FULFILLED').reduce((sum, item) => sum - minorUnits(item.remaining), minorUnits(customer.outstanding))
  const unpromised = unpromisedAmount > 0n ? unpromisedAmount : 0n
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!amountValue(amount) || !dueDate) { notify(t('required'), true); return }
    setBusy(true)
    try {
      await api.post(`/api/v1/customers/${customer.id}/commitments`, { amount, dueDate, note: note.trim() || null }, newIdempotencyKey())
      onSaved(t('savedPromise'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  return <form className="card" onSubmit={(event) => void submit(event)}>
    <div className="eyebrow">{customer.displayName} · {t('balance')}</div><div className="big-money" style={{ fontSize: 29 }}>{money(customer.outstanding, locale)}</div>
    <div className="subtle">{t('withoutPromise')}: {moneyFromMinor(unpromised, locale)}</div>
    <div className="field"><label htmlFor="promise-amount">{t('amountPromised')}</label><input id="promise-amount" className="control" type="number" min="0.01" step="0.01" max={majorFromMinor(unpromised)} value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
    <div className="field"><label htmlFor="promise-date">{t('promisedDate')}</label><input id="promise-date" className="control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div>
    <div className="field"><label htmlFor="promise-note">{t('note')}</label><textarea id="promise-note" className="control" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></div>
    <div className="note">{t('promiseDoesNotChange')}</div><button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('savePromise')}</button>
  </form>
}

function ReschedulePage({ locale, t, notify, onSaved, commitmentId, selectedCustomer }: SharedProps & { commitmentId: number }) {
  const [commitment, setCommitment] = useState<Commitment | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!selectedCustomer) return
    api.get<Commitment[]>(`/api/v1/customers/${selectedCustomer.id}/commitments`).then((items) => {
      const found = items.find((item) => item.id === commitmentId)
      if (found) { setCommitment(found); setDueDate(found.dueDate) }
    }).catch(() => notify(t('errorGeneric'), true))
  }, [commitmentId, notify, selectedCustomer?.id])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!dueDate) { notify(t('required'), true); return }
    setBusy(true)
    try {
      await api.post(`/api/v1/commitments/${commitmentId}/reschedule`, { newDueDate: dueDate, reason: reason.trim() || null }, newIdempotencyKey())
      onSaved(t('savedReschedule'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  if (!commitment) return <Loading t={t} />
  return <form className="card" onSubmit={(event) => void submit(event)}>
    <div className="eyebrow">{t('remainingPromise')}</div><div className="big-money" style={{ fontSize: 29 }}>{money(commitment.remaining, locale)}</div>
    <div className="split-row"><span>{t('dueOn')}</span><strong>{dateText(commitment.dueDate, locale)}</strong></div>
    <div className="field"><label htmlFor="new-promise-date">{t('newPromisedDate')}</label><input id="new-promise-date" className="control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div>
    <div className="field"><label htmlFor="reschedule-reason">{t('rescheduleReason')}</label><input id="reschedule-reason" className="control" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div>
    <div className="note">{t('savedReschedule')}</div><button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('saveChanges')}</button>
  </form>
}

function OpeningBalancePage({ locale, t, notify, onSaved, customer }: SharedProps & { customer: Customer }) {
  const [amount, setAmount] = useState('')
  const [cutoffDate, setCutoffDate] = useState(yesterdayInIndia())
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!amountValue(amount) || !acknowledged || !cutoffDate) { notify(t('required'), true); return }
    setBusy(true)
    try {
      await api.post(`/api/v1/customers/${customer.id}/opening-balance`, { amount, cutoffDate, acknowledged }, newIdempotencyKey())
      onSaved(t('savedOpening'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  return <form className="card" onSubmit={(event) => void submit(event)}>
    <div className="eyebrow">{customer.displayName}</div><p className="subtle">{t('openingBalanceHint')}</p>
    <div className="field"><label htmlFor="opening-amount">{t('amount')}</label><input id="opening-amount" className="control" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
    <div className="field"><label htmlFor="opening-cutoff">{t('cutoffDate')}</label><input id="opening-cutoff" className="control" type="date" value={cutoffDate} onChange={(event) => setCutoffDate(event.target.value)} required /></div>
    <Check label={t('acknowledgeOpening')} checked={acknowledged} onChange={setAcknowledged} />
    <div className="note">{t('balance')}: {money(customer.outstanding, locale)} → {moneyFromMinor(minorUnits(customer.outstanding) + minorUnits(amount || 0), locale)}</div>
    <button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('setOpeningBalance')}</button>
  </form>
}

function FollowUpsPage({ locale, t, notify, openCustomer }: SharedProps) {
  const [filter, setFilter] = useState<'all' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING'>('all')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [withoutPromise, setWithoutPromise] = useState<Customer[]>([])
  useEffect(() => {
    listAllCustomers().then((items) => {
      const due = items.filter((item) => Number(item.outstanding) > 0 && item.nextCommitment)
      setCustomers(due)
      setWithoutPromise(items.filter((item) => Number(item.outstanding) > 0 && !item.nextCommitment))
    }).catch((error) => notify(t(errorKey(error)), true))
  }, [notify, t])
  const filtered = useMemo(() => filter === 'all' ? customers : customers.filter((item) => item.nextCommitment?.status === filter), [customers, filter])
  return <>
    <div className="choice-row">{(['all', 'OVERDUE', 'DUE_TODAY', 'UPCOMING'] as const).map((value) => <button className={`choice ${filter === value ? 'active' : ''}`} key={value} type="button" onClick={() => setFilter(value)}>{value === 'all' ? t('all') : t(labelsForStatus[value])}</button>)}</div>
    {filtered.length ? filtered.map((customer) => <CustomerRow key={customer.id} customer={customer} locale={locale} t={t} onClick={() => openCustomer(customer)} />) : <EmptyState icon="◷" title={t('noFollowUps')} />}
    <div className="section-row"><h2>{t('withoutPromise')}</h2></div>
    {withoutPromise.length ? withoutPromise.map((customer) => <CustomerRow key={customer.id} customer={customer} locale={locale} t={t} onClick={() => openCustomer(customer)} />) : <EmptyState icon="✓" title={t('noActivePromise')} />}
  </>
}

function ReminderPage({ locale, t, notify, customer }: SharedProps & { customer: Customer }) {
  const [messageLocale, setMessageLocale] = useState<Locale>(customer.preferredMessageLocale || locale)
  const [format, setFormat] = useState<'SHORT' | 'DETAILED'>('SHORT')
  const [from, setFrom] = useState(firstOfMonth(todayInIndia()))
  const [to, setTo] = useState(todayInIndia())
  const [preview, setPreview] = useState<ReminderPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const createPreview = async () => {
    setBusy(true)
    try {
      setPreview(await api.post<ReminderPreview>(`/api/v1/customers/${customer.id}/reminder-preview`, {
        locale: messageLocale, format, periodStart: from, periodEnd: to,
      }))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const copy = async () => {
    if (!preview) return
    try { await navigator.clipboard.writeText(preview.message); notify(t('copied')) } catch { notify(t('errorGeneric'), true) }
  }
  return <>
    <section className="card"><div className="eyebrow">{customer.displayName} · {t('recipient')}</div><div style={{ marginTop: 7, fontWeight: 700 }}>{customer.phoneE164 || t('noPhone')}</div>
      <div className="form-section">{t('messageLanguage')}</div><div className="choice-row">{(['en-IN', 'hi-IN'] as const).map((value) => <button className={`choice ${messageLocale === value ? 'active' : ''}`} type="button" key={value} onClick={() => setMessageLocale(value)}>{value === 'en-IN' ? 'English' : 'हिन्दी'}</button>)}</div>
      <div className="form-section">{t('preview')}</div><div className="choice-row">{(['SHORT', 'DETAILED'] as const).map((value) => <button className={`choice ${format === value ? 'active' : ''}`} type="button" key={value} onClick={() => setFormat(value)}>{t(value === 'SHORT' ? 'short' : 'detailed')}</button>)}</div>
      <div className="grid-two"><div className="field"><label htmlFor="reminder-from">{t('periodFrom')}</label><input id="reminder-from" className="control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label htmlFor="reminder-to">{t('periodTo')}</label><input id="reminder-to" className="control" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div></div>
      <button className="btn wide" type="button" disabled={busy} onClick={() => void createPreview()}>{busy ? t('loading') : t('preview')}</button>
    </section>
    {preview && <>
      <span className="badge grey">{t('notSent')}</span>
      <div className="spacer" />
      <div className="statement-preview" lang={messageLocale}>{preview.message}</div>
      <div className="spacer" />
      <div className="note">{t('shareTrust')}</div>
      <div className="btn-row"><button className="btn secondary" type="button" onClick={() => void copy()}>{t('copyMessage')}</button>
        <button className="btn" type="button" onClick={() => window.open(preview.whatsappUrl, '_blank', 'noopener,noreferrer')}>{t('openWhatsApp')}</button></div>
    </>}
  </>
}

function SettingsPage({ locale, t, notify, accountHolder, onSignedOut, onLocaleChange }: SharedProps & { onSignedOut: () => void; onLocaleChange: (locale: Locale) => Promise<void> }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [kind, setKind] = useState<'vpa' | 'mobile'>('vpa')
  const [upiVpa, setUpiVpa] = useState('')
  const [mobile, setMobile] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.get<Business>('/api/v1/business').then((value) => {
      setBusiness(value); setUpiVpa(value.upiVpa || '')
      const savedMobile = value.upiLinkedMobileE164 || ''
      const hasIndianMobile = /^\+91[6-9][0-9]{9}$/.test(savedMobile)
      setMobile(hasIndianMobile ? savedMobile.slice(3) : '')
      setPayeeName(value.upiPayeeName || '')
      setKind(hasIndianMobile ? 'mobile' : 'vpa'); setConfirmed(value.paymentDetailsAccountHolderConfirmed)
    }).catch((error) => notify(t(errorKey(error)), true))
  }, [notify])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const updated = await api.patch<Business>('/api/v1/business/payment-details', {
        upiVpa: kind === 'vpa' ? upiVpa.trim() || null : null,
        upiLinkedMobileE164: kind === 'mobile' && mobile ? `+91${mobile}` : null,
        upiPayeeName: payeeName.trim() || null,
        accountHolderConfirmed: !upiVpa && !mobile ? true : confirmed,
      })
      setBusiness(updated); notify(t('saveSettings'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const signOut = async () => {
    try { await api.post('/api/v1/auth/logout', {}); onSignedOut() } catch (error) { notify(t(errorKey(error)), true) }
  }
  return <>
    <section className="card"><div className="eyebrow">{t('appLanguage')}</div><p className="subtle">{accountHolder.businessName}</p><div className="btn-row"><button className={`btn ${locale === 'en-IN' ? '' : 'secondary'}`} type="button" onClick={() => void onLocaleChange('en-IN')}>{t('english')}</button><button className={`btn ${locale === 'hi-IN' ? '' : 'secondary'}`} type="button" onClick={() => void onLocaleChange('hi-IN')}>{t('hindi')}</button></div></section>
    <form className="card" onSubmit={(event) => void save(event)}>
      <div className="eyebrow">{t('paymentDetails')}</div><p className="subtle">{t('paymentDetailsHint')}</p>
      <div className="choice-row"><button className={`choice ${kind === 'vpa' ? 'active' : ''}`} type="button" onClick={() => setKind('vpa')}>{t('upiId')}</button><button className={`choice ${kind === 'mobile' ? 'active' : ''}`} type="button" onClick={() => setKind('mobile')}>{t('upiMobile')}</button></div>
      {kind === 'vpa' ? <div className="field"><label htmlFor="shop-upi">{t('upiId')}</label><input id="shop-upi" className="control" value={upiVpa} onChange={(event) => { setUpiVpa(event.target.value); setConfirmed(false) }} maxLength={120} /></div> : <div className="field"><label htmlFor="shop-mobile">{t('upiMobile')}</label><IndiaPhoneInput id="shop-mobile" value={mobile} onChange={(value) => { setMobile(value); setConfirmed(false) }} /></div>}
      <div className="field"><label htmlFor="payee-name">{t('payeeName')}</label><input id="payee-name" className="control" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} maxLength={160} /></div>
      {(upiVpa || mobile) && <Check label={t('accountHolderConfirmPayment')} checked={confirmed} onChange={setConfirmed} />}
      {business?.paymentDetailsAccountHolderConfirmed && <div className="note">{t('paymentDetailsHint')}</div>}
      <button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('saveSettings')}</button>
    </form>
    <LinkSignInMethods locale={locale} t={t} notify={notify} accountHolder={accountHolder} />
    <section className="card"><div className="eyebrow">{accountHolder.email || accountHolder.phoneNumber}</div><button className="btn danger wide" type="button" style={{ marginTop: 12 }} onClick={() => void signOut()}>{t('signOut')}</button></section>
  </>
}

function LinkSignInMethods({ locale, t, notify, accountHolder }: Pick<SharedProps, 'locale' | 't' | 'notify' | 'accountHolder'>) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState(accountHolder.email || '')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [developmentCode, setDevelopmentCode] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<AuthConfig>('/api/v1/auth/config').then(setConfig).catch(() => {}) }, [])
  const linkGoogle = async (idToken: string) => {
    setBusy(true)
    try {
      await api.post('/api/v1/account-holder/identities/google', { idToken })
      notify(t('linked'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const requestEmailLink = async () => {
    setBusy(true)
    try {
      const result = await api.post<{ challengeId: string; developmentCode?: string }>(
        '/api/v1/account-holder/identities/email/request', { email: email.trim(), purpose: 'LINK', preferredLocale: locale },
      )
      setChallengeId(result.challengeId)
      setDevelopmentCode(result.developmentCode || '')
      setCode('')
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const verifyEmailLink = async () => {
    setBusy(true)
    try {
      await api.post('/api/v1/account-holder/identities/email/verify', { email: email.trim(), challengeId, otp: code })
      setChallengeId('')
      setDevelopmentCode('')
      notify(t('linked'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  if (!config || (!config.emailEnabled && !config.googleClientId)) return null
  return <section className="card">
    <div className="eyebrow">{t('linkSignIn')}</div>
    {config.googleClientId && <GoogleSignInButton clientId={config.googleClientId} locale={locale} onCredential={(token) => void linkGoogle(token)} onError={() => notify(t('errorGoogleAuth'), true)} />}
    {config.emailEnabled && <>
      <div className="field"><label htmlFor="link-email">{t('email')}</label><input id="link-email" className="control" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={190} /></div>
      {!challengeId ? <button type="button" className="btn secondary" disabled={busy || !email.trim()} onClick={() => void requestEmailLink()}>{t('linkEmail')}</button> : <>
        {developmentCode && <div className="note" role="status">{t('devCodeNotice')} <strong>{developmentCode}</strong></div>}
        <div className="field"><label htmlFor="link-code">{t('verificationCode')}</label><input id="link-code" className="control" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} /></div>
        <button type="button" className="btn secondary" disabled={busy || code.length !== 6} onClick={() => void verifyEmailLink()}>{t('linkEmail')}</button>
      </>}
    </>}
  </section>
}

function ScanPage({ t, notify, openCustomer, onNavigate, selectedCustomer, refreshKey, locale }: SharedProps & { onNavigate: (page: Page) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState(selectedCustomer ? String(selectedCustomer.id) : '')
  const [file, setFile] = useState<File | null>(null)
  const [keepAttachment, setKeepAttachment] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scanId, setScanId] = useState<number | null>(null)
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState<number | null>(null)
  const [occurredOn, setOccurredOn] = useState('')
  const [description, setDescription] = useState('')
  const [discount, setDiscount] = useState('0.00')
  const [lines, setLines] = useState<{ name: string; quantity: string; unit: string; unitPrice: string }[]>([])
  const [paidNowEnabled, setPaidNowEnabled] = useState(false)
  const [paidNowAmount, setPaidNowAmount] = useState('')
  const [paidNowMethod, setPaidNowMethod] = useState('CASH')
  const [paidNowConfirmed, setPaidNowConfirmed] = useState(false)
  const uploadKey = useRef(newIdempotencyKey())

  useEffect(() => {
    let active = true
    listAllCustomers().then((result) => {
      if (!active) return
      setCustomers(result)
      const preferred = selectedCustomer && result.some((item) => item.id === selectedCustomer.id)
        ? String(selectedCustomer.id) : (result[0] ? String(result[0].id) : '')
      setCustomerId((current) => current || preferred)
    }).catch((error) => { if (active) notify(t(errorKey(error)), true) })
    return () => { active = false }
  }, [notify, t, refreshKey, selectedCustomer?.id])

  useEffect(() => {
    if (scanId === null) return
    let active = true
    let timer: number | undefined
    const poll = async () => {
      try {
        const current = await api.get<ScanStatus>(`/api/v1/scans/${scanId}`)
        if (!active) return
        setScan(current)
        if (current.status === 'QUEUED' || current.status === 'PROCESSING') timer = window.setTimeout(() => void poll(), 1400)
      } catch (error) {
        if (active) notify(t(errorKey(error)), true)
      }
    }
    void poll()
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer) }
  }, [scanId, notify, t])

  useEffect(() => {
    let active = true
    let nextUrl: string | null = null
    if (scanId !== null && scan?.imageAvailable) {
      api.getBlob(`/api/v1/scans/${scanId}/image`).then((blob) => {
        if (!active) return
        nextUrl = URL.createObjectURL(blob)
        setImageUrl(nextUrl)
      }).catch(() => { if (active) setImageUrl(null) })
    } else {
      setImageUrl(null)
    }
    return () => { active = false; if (nextUrl) URL.revokeObjectURL(nextUrl) }
  }, [scanId, scan?.imageAvailable])

  useEffect(() => {
    const draft = scan?.draft
    if (scan?.status !== 'REVIEW_REQUIRED' || !draft || scan.draftVersion == null) return
    setDraftVersion(scan.draftVersion)
    setOccurredOn(draft.occurredOn || '')
    setDescription(draft.description || '')
    setDiscount(draft.discount || '0.00')
    setLines(draft.lines.map((line) => ({ name: line.name || '', quantity: line.quantity || '', unit: line.unit || '', unitPrice: line.unitPrice || '' })))
  }, [scan?.scanId, scan?.status, scan?.draftVersion])

  const addLine = () => setLines((current) => [...current, { name: '', quantity: '1', unit: '', unitPrice: '' }])
  const updateLine = (index: number, field: 'name' | 'quantity' | 'unit' | 'unitPrice', value: string) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line))
  }
  const upload = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || !customerId) { notify(t(!file ? 'scanNoFile' : 'required'), true); return }
    if (file.size > 10 * 1024 * 1024) { notify(t('scanImageTooLarge'), true); return }
    const data = new FormData()
    data.append('file', file)
    data.append('keepAttachment', String(keepAttachment))
    setBusy(true)
    try {
      const result = await api.upload<ScanUpload>(`/api/v1/customers/${customerId}/scans`, data, uploadKey.current)
      setScanId(result.scanId)
      setScan(null)
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (scanId === null || draftVersion === null) return
    if (!lines.length || lines.some((line) => !line.name.trim() || !line.quantity || !line.unitPrice) || !occurredOn) {
      notify(t('required'), true); return
    }
    if (paidNowEnabled && (!paidNowAmount || !paidNowConfirmed)) { notify(t('errorConfirmation'), true); return }
    setBusy(true)
    try {
      const posted = await api.post<PurchaseRecord>(`/api/v1/scans/${scanId}/confirm`, {
        version: draftVersion, occurredOn, description: description.trim() || null,
        discount: discount || '0.00',
        lines: lines.map((line) => ({ name: line.name.trim(), quantity: line.quantity, unit: line.unit.trim() || null, unitPrice: line.unitPrice })),
        paidNow: paidNowEnabled ? { amount: paidNowAmount, method: paidNowMethod, confirmedByAccountHolder: paidNowConfirmed } : null,
      }, newIdempotencyKey())
      const customer = customers.find((item) => item.id === posted.customerId) || selectedCustomer
      notify(t('savedPurchase'))
      if (customer) openCustomer(customer)
      onNavigate('account')
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }

  const selected = customers.find((item) => String(item.id) === customerId)
  const extracting = scan?.status === 'QUEUED' || scan?.status === 'PROCESSING'
  const totalMismatch = scan?.draft?.flags.includes('TOTAL_MISMATCH') || scan?.draft?.flags.includes('INVALID_CALCULATED_TOTAL')
  const draftLines = scan?.draft?.lines || []
  return <>
    {!scanId && <>
      <p className="subtle">{t('scanHint')}</p>
      {!customers.length ? <EmptyState icon="♙" title={t('noCustomers')} detail={t('noCustomersHint')} action={<button className="btn" type="button" onClick={() => onNavigate('newCustomer')}>{t('addCustomer')}</button>} /> :
        <form className="card" onSubmit={(event) => void upload(event)}>
          <div className="field"><label htmlFor="scan-customer">{t('scanSelectCustomer')}</label><select id="scan-customer" className="control" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}{customer.phoneE164 ? ` · ${customer.phoneE164.slice(-4)}` : ''} · #{customer.id}</option>)}
          </select></div>
          <div className="field"><label htmlFor="scan-file">{t('scanPhotoLabel')}</label><input id="scan-file" className="control scan-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { setFile(event.target.files?.[0] || null); uploadKey.current = newIdempotencyKey() }} required /></div>
          {file && <div className="note">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</div>}
          <label className="toggle-row"><input type="checkbox" checked={keepAttachment} onChange={(event) => setKeepAttachment(event.target.checked)} /><span>{t('scanKeepAttachment')}</span></label>
          <p className="subtle">{t('scanPrivacy')}</p>
          <button className="btn wide" type="submit" disabled={busy || !file}>{busy ? t('saving') : t('scanUploadAction')}</button>
        </form>}
    </>}

    {scanId !== null && <>
      <div className="scan-state card" role="status"><span className="scan-state-symbol" aria-hidden="true">{extracting ? '◌' : scan?.status === 'REVIEW_REQUIRED' ? '✓' : '!'}</span><div><strong>{scan?.status === 'REVIEW_REQUIRED' ? t('scanReviewRequired') : extracting ? t(scan.status === 'QUEUED' ? 'scanQueued' : 'scanProcessing') : scan?.status === 'POSTED' ? t('savedPurchase') : t('scanFailed')}</strong><div className="subtle">{selected?.displayName || ''}</div></div></div>
      {scan?.status === 'FAILED' && <section className="card"><p>{t('scanFailed')}</p><button className="btn wide" type="button" onClick={() => { if (selected) { openCustomer(selected); onNavigate('purchase') } }}>{t('scanManualFallback')}</button></section>}
      {scan?.status === 'REVIEW_REQUIRED' && scan.draft && <form onSubmit={(event) => void confirm(event)}>
        <div className="scan-review-grid">
          <section className="card scan-original"><div className="eyebrow">{t('scanOriginal')}</div>{imageUrl ? <img src={imageUrl} alt={t('scanOriginal')} /> : <p className="subtle">{t('scanNoImage')}</p>}</section>
          <section className="card scan-editor"><div className="note warn">{t('scanReviewRequired')}</div>
            {(scan.draft.flags.length > 0) && <div className="note warn">{t('scanCheckFields')}{totalMismatch ? ` ${t('scanTotalMismatch')}` : ''}</div>}
            <div className="field"><label htmlFor="scan-date">{t('scanBillDate')}</label><input className="control" id="scan-date" type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required /></div>
            <div className="field"><label htmlFor="scan-description">{t('description')}</label><input className="control" id="scan-description" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></div>
            {lines.map((line, index) => <div className="scan-line" key={index}>
              <div className="scan-line-heading"><strong>{t('itemName')} {index + 1}</strong><button className="link-button" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>{t('scanRemoveItem')}</button></div>
              <div className="field"><label htmlFor={`scan-name-${index}`}>{t('itemName')}</label><input id={`scan-name-${index}`} className="control" value={line.name} maxLength={200} onChange={(event) => updateLine(index, 'name', event.target.value)} required /></div>
              <div className="scan-line-fields">
                <div className="field"><label htmlFor={`scan-qty-${index}`}>{t('quantity')}</label><input id={`scan-qty-${index}`} className="control" type="number" min="0.001" step="0.001" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} required /></div>
                <div className="field"><label htmlFor={`scan-unit-${index}`}>{t('unit')}</label><input id={`scan-unit-${index}`} className="control" value={line.unit} maxLength={40} onChange={(event) => updateLine(index, 'unit', event.target.value)} /></div>
                <div className="field"><label htmlFor={`scan-price-${index}`}>{t('unitPrice')}</label><input id={`scan-price-${index}`} className="control" type="number" min="0" step="0.01" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, 'unitPrice', event.target.value)} required /></div>
              </div>
              {draftLines[index]?.flags.length > 0 && <small className="scan-uncertain">{t('scanCheckFields')}</small>}
            </div>)}
            <button className="btn secondary wide" type="button" onClick={addLine}>＋ {t('scanAddItem')}</button>
            <div className="scan-totals">
              <div className="field"><label htmlFor="scan-discount">{t('scanDiscount')}</label><input className="control" id="scan-discount" type="number" min="0" step="0.01" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
              <div className="scan-total-row"><span>{t('scanWrittenTotal')}</span><strong>{scan.draft.writtenTotal ? money(scan.draft.writtenTotal, locale) : '—'}</strong></div>
              <div className="scan-total-row"><span>{t('scanCalculatedTotal')}</span><strong>{moneyFromMinor(lines.reduce((sum, line) => sum + itemLineMinor(line.quantity || '0', line.unitPrice || '0'), 0n) - minorUnits(discount || '0'), locale)}</strong></div>
            </div>
            <label className="toggle-row"><input type="checkbox" checked={paidNowEnabled} onChange={(event) => { setPaidNowEnabled(event.target.checked); setPaidNowConfirmed(false) }} /><span>{t('paidNow')}</span></label>
            {paidNowEnabled && <>
              <p className="subtle">{t('scanPaidNowHelp')}</p>
              <div className="field"><label htmlFor="scan-paid-now">{t('scanPaidNowAmount')}</label><input id="scan-paid-now" className="control" type="number" min="0.01" step="0.01" inputMode="decimal" value={paidNowAmount} onChange={(event) => setPaidNowAmount(event.target.value)} required /></div>
              <PaymentMethod value={paidNowMethod} onChange={setPaidNowMethod} t={t} />
              <Check label={t('scanPaidNowConfirmed')} checked={paidNowConfirmed} onChange={setPaidNowConfirmed} />
            </>}
            <button className="btn wide" type="submit" disabled={busy || !occurredOn || !lines.length || (paidNowEnabled && !paidNowConfirmed)}>{busy ? t('saving') : t('scanConfirm')}</button>
          </section>
        </div>
      </form>}
    </>}
  </>
}

function PaymentMethod({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: (key: TranslationKey) => string }) {
  return <div className="field"><label htmlFor="payment-method">{t('paymentMethod')}</label><select id="payment-method" className="control" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="CASH">{t('cash')}</option><option value="UPI">{t('upi')}</option><option value="BANK">{t('bank')}</option><option value="OTHER">{t('other')}</option>
  </select></div>
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}

function StatusBadge({ status, t }: { status: string; t: (key: TranslationKey) => string }) {
  const key = labelsForStatus[status]
  const className = status === 'OVERDUE' ? 'red' : status === 'DUE_TODAY' ? 'amber' : status === 'FULFILLED' ? 'grey' : ''
  return <span className={`badge ${className}`}>{key ? t(key) : status}</span>
}

function Split({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return <div className={`split-row ${total ? 'total-row' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function Loading({ t }: { t: (key: TranslationKey) => string }) {
  return <div className="card subtle" role="status">{t('loading')}</div>
}

function EmptyState({ icon, title, detail, action }: { icon: string; title: string; detail?: string; action?: ReactNode | null }) {
  return <section className="card empty-state"><div className="empty-symbol" aria-hidden="true">{icon}</div><h2>{title}</h2>{detail && <p>{detail}</p>}{action && <div className="spacer" />}{action}</section>
}
