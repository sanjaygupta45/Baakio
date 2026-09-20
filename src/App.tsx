import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, newIdempotencyKey, query } from './api'
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
  BusinessOwner,
} from './types'
import { ApiError } from './types'
import LandingPage from './LandingPage'

type Page = 'home' | 'customers' | 'scan' | 'followUps' | 'settings' | 'account' | 'newCustomer' | 'purchase' | 'payment' | 'promise' | 'reschedule' | 'opening' | 'reminder'
type AccountTab = 'activity' | 'promises' | 'statement'
type AuthPurpose = 'LOGIN' | 'REGISTER'

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
  businessOwner: BusinessOwner
  selectedCustomer: Customer | null
  refreshKey: number
}

export default function App() {
  const [businessOwner, setBusinessOwner] = useState<BusinessOwner | null>(null)
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
    api.get<BusinessOwner>('/api/v1/business-owner').then(async (currentBusinessOwner) => {
      const preferredLocale = currentBusinessOwner.preferredLocale || locale
      await i18n.changeLanguage(preferredLocale)
      setBusinessOwner(currentBusinessOwner)
      setLocale(preferredLocale)
      storeLocale(preferredLocale)
    }).catch(() => setBusinessOwner(null)).finally(() => setBooting(false))
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
    if (!businessOwner) {
      await i18n.changeLanguage(next)
      setLocale(next)
      setLocaleChosenBeforeLogin(true)
      storeLocale(next)
      return
    }
    try {
      await api.patch('/api/v1/business-owner/preferences', { preferredLocale: next })
      await i18n.changeLanguage(next)
      setLocale(next)
      storeLocale(next)
      setBusinessOwner({ ...businessOwner, preferredLocale: next })
    } catch (error) {
      notify(i18n.getFixedT(next)(errorKey(error)), true)
    }
  }

  const signIn = async (signedInOwner: BusinessOwner) => {
    const selectedLocale = localeChosenBeforeLogin ? locale : signedInOwner.preferredLocale || locale
    await i18n.changeLanguage(selectedLocale)
    const signedInOwnerWithLocale = { ...signedInOwner, preferredLocale: selectedLocale }
    setBusinessOwner(signedInOwnerWithLocale)
    setShowLogin(false)
    setLocale(selectedLocale)
    storeLocale(selectedLocale)
    if (selectedLocale !== signedInOwner.preferredLocale) {
      void api.patch('/api/v1/business-owner/preferences', { preferredLocale: selectedLocale }).catch(() => notify(i18n.getFixedT(selectedLocale)('errorGeneric'), true))
    }
    setLocaleChosenBeforeLogin(false)
    setPage('home')
  }

  const shared: SharedProps = { locale, t, notify, onSaved, openCustomer, businessOwner: businessOwner!, selectedCustomer, refreshKey }

  if (!businessOwner && booting && !showLogin && !isAppEntry) return <LandingPage locale={locale} onLocaleChange={changeLocale} onLogin={startLogin} onRegister={startRegistration} />
  if (booting) return <div className="loading-screen" role="status">{t('loading')}</div>
  if (!businessOwner) {
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

  return <div className="desktop-layout">
    <aside className="desktop-aside" aria-label="Baakio">
      <h1>baakio<span className="brand-dot">.</span></h1>
      <div className="eyebrow">{t('descriptor')}</div>
      <p>{t('tagline')}</p>
      <div className="aside-hint">{t('signInHint')}</div>
    </aside>
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand-block">
            <div className="brand">baakio<span className="brand-dot">.</span></div>
            <div className="identity">{businessOwner.businessName} · {t('descriptor')}</div>
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
        {page === 'settings' && <SettingsPage {...sharedWithSelected} onLocaleChange={changeLocale} onSignedOut={() => { setBusinessOwner(null); setPage('home'); setShowLogin(false); setAuthPurpose('LOGIN') }} />}
        {page === 'scan' && <ScanPage {...sharedWithSelected} onNavigate={setPage} />}
      </main>

      <nav className="bottom-nav" aria-label={t('home')}>
        {([
          ['home', '⌂', 'home'], ['customers', '♙', 'customers'], ['scan', '▣', 'scan'], ['followUps', '◷', 'followUps'],
        ] as [Page, string, TranslationKey][]).map(([target, icon, label]) => <button key={target}
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
  initialPurpose: AuthPurpose; onSignIn: (businessOwner: BusinessOwner) => void; onLocale: (locale: Locale) => void; onBack: () => void
}) {
  const [purpose, setPurpose] = useState<AuthPurpose>(initialPurpose)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [developmentCode, setDevelopmentCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const phoneE164 = `+91${phoneNumber}`
  const [resendAt, setResendAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!resendAt) return
    const updateCountdown = () => setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)))
    updateCountdown()
    const timer = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])

  const requestCode = async () => {
    if (!/^[6-9][0-9]{9}$/.test(phoneNumber)) {
      const message = t('errorPhone')
      setErrorMessage(message)
      notify(message, true)
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await api.post<{ challengeId: string; expiresInSeconds: number; resendAfterSeconds: number; developmentCode?: string }>(
        '/api/v1/auth/otp/request',
        { phoneNumber: phoneE164, purpose, preferredLocale: locale },
      )
      setChallengeId(response.challengeId)
      setDevelopmentCode(response.developmentCode || '')
      setOtp('')
      setResendAt(Date.now() + response.resendAfterSeconds * 1000)
      setStep('code')
    } catch (error) {
      const message = error instanceof ApiError && error.code === 'PHONE_ALREADY_REGISTERED'
        ? t('errorPhoneRegistered')
        : t(errorKey(error))
      setErrorMessage(message)
      notify(message, true)
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step === 'phone') {
      await requestCode()
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const body = purpose === 'LOGIN'
        ? { phoneNumber: phoneE164, challengeId, otp }
        : {
          phoneNumber: phoneE164, challengeId, otp,
          displayName: displayName.trim(), businessName: businessName.trim(),
          email: email.trim() || null, preferredLocale: locale,
        }
      const response = await api.post<{ businessOwner: BusinessOwner }>(`/api/v1/auth/${purpose === 'LOGIN' ? 'login' : 'register'}`, body)
      onSignIn(response.businessOwner)
    } catch (error) {
      const message = error instanceof ApiError && error.code === 'PHONE_ALREADY_REGISTERED'
        ? t('errorPhoneRegistered')
        : error instanceof ApiError && error.code === 'ACCOUNT_NOT_FOUND'
          ? t('errorAccountNotFound')
          : error instanceof ApiError && error.code === 'INVALID_OR_EXPIRED_OTP'
            ? t('errorOtp')
            : t(errorKey(error))
      setErrorMessage(message)
      notify(message, true)
    } finally {
      setBusy(false)
    }
  }

  const changePhone = () => {
    setStep('phone')
    setChallengeId('')
    setOtp('')
    setDevelopmentCode('')
    setErrorMessage('')
  }

  const switchPurpose = (next: 'LOGIN' | 'REGISTER') => {
    setPurpose(next)
    setErrorMessage('')
  }

  return <div className="desktop-layout">
    <aside className="desktop-aside"><h1>baakio<span className="brand-dot">.</span></h1><div className="eyebrow">{t('descriptor')}</div><p>{t('tagline')}</p></aside>
    <div className="app-frame">
      <header className="topbar"><div className="topbar-row"><div className="brand">baakio<span className="brand-dot">.</span></div>
        <button className="icon-btn" type="button" onClick={onBack}>{t('back')}</button>
        <button className="icon-btn" type="button" onClick={() => onLocale(locale === 'en-IN' ? 'hi-IN' : 'en-IN')}>{locale === 'en-IN' ? 'हिन्दी' : 'English'}</button></div>
        <div className="page-heading"><div><h1>{step === 'phone' ? (purpose === 'LOGIN' ? t('signIn') : t('registerTitle')) : t('verifyCode')}</h1><p>{t('descriptor')}</p></div></div>
      </header>
      <main className="screen">
        <form className="card" onSubmit={(event) => void submit(event)}>
          {errorMessage && <div className="note error" role="alert">{errorMessage}</div>}
          {step === 'phone' ? <>
            <div className="btn-row" role="tablist" aria-label={t('authOptions')}>
              <button className={`btn ${purpose === 'LOGIN' ? '' : 'secondary'}`} type="button" role="tab" aria-selected={purpose === 'LOGIN'} onClick={() => switchPurpose('LOGIN')}>{t('signIn')}</button>
              <button className={`btn ${purpose === 'REGISTER' ? '' : 'secondary'}`} type="button" role="tab" aria-selected={purpose === 'REGISTER'} onClick={() => switchPurpose('REGISTER')}>{t('createAccount')}</button>
            </div>
            <p className="subtle">{purpose === 'LOGIN' ? t('signInHint') : t('registerHint')}</p>
            <div className="field"><label htmlFor="auth-phone">{t('authPhone')}</label><IndiaPhoneInput id="auth-phone" value={phoneNumber} onChange={setPhoneNumber} required /></div>
            {purpose === 'REGISTER' && <>
              <div className="field"><label htmlFor="auth-name">{t('fullName')}</label><input className="control" id="auth-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={160} /></div>
              <div className="field"><label htmlFor="auth-business">{t('shopName')}</label><input className="control" id="auth-business" autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required maxLength={160} /></div>
              <div className="field"><label htmlFor="auth-email">{t('optionalEmail')}</label><input className="control" id="auth-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={190} /></div>
            </>}
            <button className="btn wide" disabled={busy} type="submit">{busy ? t('loading') : t('sendCode')}</button>
          </> : <>
            <p className="subtle">{t('codeSent')} +91 {phoneNumber} <button className="link-button" type="button" onClick={changePhone}>{t('changePhone')}</button></p>
            {developmentCode && <div className="note" role="status">{t('devCodeNotice')} <strong>{developmentCode}</strong></div>}
            <div className="field"><label htmlFor="auth-otp">{t('verificationCode')}</label><input className="control" id="auth-otp" autoComplete="one-time-code" inputMode="numeric" type="text" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} /></div>
            <button className="btn wide" disabled={busy || otp.length !== 6} type="submit">{busy ? t('loading') : purpose === 'LOGIN' ? t('signInButton') : t('finishRegistration')}</button>
            <button className="link-button" type="button" disabled={busy || secondsLeft > 0} onClick={() => void requestCode()}>{secondsLeft > 0 ? `${t('resendCode')} (${secondsLeft})` : t('resendCode')}</button>
          </>}
        </form>
      </main>
      <div className="toast error" style={{ display: 'none' }} />
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
    if (paidNow) body.paidNow = { amount: paidNow, method: paidMethod, confirmedByOwner: paidConfirmed }
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
        amount, method, occurredOn, reference: reference.trim() || null, confirmedByOwner: confirmed, allocations,
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

function SettingsPage({ locale, t, notify, businessOwner, onSignedOut, onLocaleChange }: SharedProps & { onSignedOut: () => void; onLocaleChange: (locale: Locale) => Promise<void> }) {
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
      setKind(hasIndianMobile ? 'mobile' : 'vpa'); setConfirmed(value.paymentDetailsOwnerConfirmed)
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
        ownerConfirmed: !upiVpa && !mobile ? true : confirmed,
      })
      setBusiness(updated); notify(t('saveSettings'))
    } catch (error) { notify(t(errorKey(error)), true) } finally { setBusy(false) }
  }
  const signOut = async () => {
    try { await api.post('/api/v1/auth/logout', {}); onSignedOut() } catch (error) { notify(t(errorKey(error)), true) }
  }
  return <>
    <section className="card"><div className="eyebrow">{t('appLanguage')}</div><p className="subtle">{businessOwner.businessName}</p><div className="btn-row"><button className={`btn ${locale === 'en-IN' ? '' : 'secondary'}`} type="button" onClick={() => void onLocaleChange('en-IN')}>{t('english')}</button><button className={`btn ${locale === 'hi-IN' ? '' : 'secondary'}`} type="button" onClick={() => void onLocaleChange('hi-IN')}>{t('hindi')}</button></div></section>
    <form className="card" onSubmit={(event) => void save(event)}>
      <div className="eyebrow">{t('paymentDetails')}</div><p className="subtle">{t('paymentDetailsHint')}</p>
      <div className="choice-row"><button className={`choice ${kind === 'vpa' ? 'active' : ''}`} type="button" onClick={() => setKind('vpa')}>{t('upiId')}</button><button className={`choice ${kind === 'mobile' ? 'active' : ''}`} type="button" onClick={() => setKind('mobile')}>{t('upiMobile')}</button></div>
      {kind === 'vpa' ? <div className="field"><label htmlFor="shop-upi">{t('upiId')}</label><input id="shop-upi" className="control" value={upiVpa} onChange={(event) => { setUpiVpa(event.target.value); setConfirmed(false) }} maxLength={120} /></div> : <div className="field"><label htmlFor="shop-mobile">{t('upiMobile')}</label><IndiaPhoneInput id="shop-mobile" value={mobile} onChange={(value) => { setMobile(value); setConfirmed(false) }} /></div>}
      <div className="field"><label htmlFor="payee-name">{t('payeeName')}</label><input id="payee-name" className="control" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} maxLength={160} /></div>
      {(upiVpa || mobile) && <Check label={t('ownerConfirmPayment')} checked={confirmed} onChange={setConfirmed} />}
      {business?.paymentDetailsOwnerConfirmed && <div className="note">{t('paymentDetailsHint')}</div>}
      <button className="btn wide" type="submit" disabled={busy}>{busy ? t('saving') : t('saveSettings')}</button>
    </form>
    <section className="card"><div className="eyebrow">{businessOwner.phoneNumber}</div><button className="btn danger wide" type="button" style={{ marginTop: 12 }} onClick={() => void signOut()}>{t('signOut')}</button></section>
  </>
}

function ScanPage({ t, notify, openCustomer, onNavigate }: SharedProps & { onNavigate: (page: Page) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  useEffect(() => { listAllCustomers().then((result) => { setCustomers(result); setCustomerId(result[0] ? String(result[0].id) : '') }).catch((error) => notify(t(errorKey(error)), true)) }, [notify])
  return <>
    <div className="note warn">{t('scanUnavailable')} {t('scanHint')}</div>
    <div className="scan-tile"><div className="scan-symbol" aria-hidden="true">▣</div><strong>{t('scanTitle')}</strong><p className="subtle">{t('scanHint')}</p></div>
    {customers.length > 0 && <section className="card" style={{ marginTop: 12 }}>
      <div className="field"><label htmlFor="scan-customer">{t('customerAccount')}</label><select id="scan-customer" className="control" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select></div>
      <button className="btn wide" type="button" onClick={() => { const customer = customers.find((item) => String(item.id) === customerId); if (customer) { openCustomer(customer); onNavigate('purchase'); } }}>{t('addManually')}</button>
    </section>}
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
