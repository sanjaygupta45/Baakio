import { useState } from 'react'
import type { Locale } from './types'

interface LandingPageProps {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  onLogin: () => void
  onRegister: () => void
}

const english = {
  tagline: 'हर बही का सही हिसाब',
  features: 'Features',
  howItWorks: 'How it works',
  pricing: 'Pricing',
  faq: 'FAQ',
  whyBaakio: 'Why Baakio',
  policies: 'Policies',
  privacy: 'Privacy',
  terms: 'Terms',
  logIn: 'Log in',
  getStarted: 'Get started',
  label: 'Built for local shops',
  title: 'Track every payment with clarity.',
  intro: 'Know who owes what, what you have collected, and what is due next.',
  demo: 'View demo',
  demoLabel: 'Sample account',
  greeting: 'Good morning, Rahul',
  total: 'Total outstanding',
  customers: '4 customers',
  received: 'Received',
  dueToday: 'Due today',
  recent: 'Customers to follow up',
  due: 'due',
  valueEnglish: 'English + Hindi',
  valueMobile: 'Works on mobile',
  valueSimple: 'Simple bill entry',
  valueReminder: 'WhatsApp reminders',
  featureTitle: 'A clear view of every account',
  featureIntro: 'Keep customer balances, payments, and promises in one place.',
  problemTitle: 'The hard part is remembering everything after the sale.',
  problemIntro: 'Small shops run on trust and credit. When notes are scattered, it becomes difficult to know what is due, who promised to pay, and what was already collected.',
  problemLabel: 'Common problem',
  solutionLabel: 'Baakio helps',
  problemOneTitle: '“Who still has to pay?”',
  problemOneBody: 'Purchases and payments get split across notebooks, messages, and memory.',
  problemOneSolution: 'See one clear balance for every customer.',
  problemTwoTitle: 'Promises disappear in busy days',
  problemTwoBody: 'A promised date is easy to forget when the counter gets busy.',
  problemTwoSolution: 'Keep due dates and follow-ups in one simple list.',
  problemThreeTitle: 'Writing every bill takes time',
  problemThreeBody: 'Handwritten bills must be retyped, and small mistakes become hard to spot.',
  problemThreeSolution: 'Create a draft, review it, and save only what is correct.',
  problemCta: 'See how Baakio helps',
  balanceTitle: 'Customer balances',
  balanceBody: 'See who owes what, with due dates and payment history.',
  promiseTitle: 'Payment promises',
  promiseBody: 'Track promised dates and see who needs a follow-up.',
  entryTitle: 'Easy bill entry',
  entryBody: 'Record a quick total or add each item to a bill.',
  reminderTitle: 'Clear reminders',
  reminderBody: 'Prepare a simple payment reminder to share on WhatsApp.',
  howTitle: 'Easy to use, every day',
  howIntro: 'Start with your customer list. Baakio keeps the details together.',
  stepOneTitle: 'Add your customers',
  stepOneBody: 'Save a name and contact details for each customer.',
  stepTwoTitle: 'Record bills and payments',
  stepTwoBody: 'Add credit, record payments, and note promised dates.',
  stepThreeTitle: 'Follow up with clarity',
  stepThreeBody: 'Check due amounts and share a clear reminder when needed.',
  localTitle: 'Made for local shops.',
  localBody: 'From a small shop to a growing business, keep customer credit clear and easy to follow.',
  pricingTitle: 'Simple pricing for your shop',
  pricingBody: 'Pricing details are coming soon. Existing account holders can sign in to Baakio.',
  faqTitle: 'Common questions',
  questionOne: 'What can I track with Baakio?',
  answerOne: 'Customer credit, bills, received payments, and payment promises.',
  questionTwo: 'Can I use Baakio in Hindi?',
  answerTwo: 'Yes. Baakio supports English and Hindi.',
  questionThree: 'Does Baakio collect payments?',
  answerThree: 'No. Baakio helps you record payments and follow customer balances.',
  questionFour: 'Can I scan a bill?',
  answerFour: 'Bill scanning is in development. You can enter bills manually now.',
  finalTitle: 'Keep your shop accounts clear.',
  finalBody: 'Simple to use. Made for your business.',
  footer: 'Keep customer credit and payments clear.',
  menu: 'Open menu',
}

const hindi = {
  ...english,
  tagline: 'हर बही का सही हिसाब',
  features: 'खूबियां',
  howItWorks: 'कैसे काम करता है',
  pricing: 'कीमत',
  faq: 'सवाल-जवाब',
  whyBaakio: 'Baakio क्यों',
  policies: 'नीतियाँ',
  privacy: 'गोपनीयता',
  terms: 'नियम',
  logIn: 'लॉग इन',
  getStarted: 'शुरू करें',
  label: 'स्थानीय दुकानों के लिए',
  title: 'हर भुगतान का साफ हिसाब रखें।',
  intro: 'किसका कितना बाकी है, कितना मिला है और आगे क्या देय है - सब जानें।',
  demo: 'डेमो देखें',
  demoLabel: 'नमूना खाता',
  greeting: 'सुप्रभात, राहुल',
  total: 'कुल बकाया',
  customers: '4 ग्राहक',
  received: 'मिला',
  dueToday: 'आज देय',
  recent: 'फॉलो-अप वाले ग्राहक',
  due: 'बाकी',
  valueEnglish: 'अंग्रेजी + हिंदी',
  valueMobile: 'मोबाइल पर आसान',
  valueSimple: 'आसान बिल एंट्री',
  valueReminder: 'WhatsApp रिमाइंडर',
  featureTitle: 'हर खाते का साफ हिसाब',
  featureIntro: 'ग्राहक का बकाया, भुगतान और वादे एक जगह रखें।',
  problemTitle: 'मुश्किल बिक्री नहीं, बिक्री के बाद का हिसाब है।',
  problemIntro: 'छोटी दुकानें भरोसे और उधार पर चलती हैं। जब नोट अलग-अलग जगह हों, तो पता करना मुश्किल होता है कि किससे लेना है, किसने कब देने को कहा और कितना मिल चुका है।',
  problemLabel: 'आम समस्या',
  solutionLabel: 'Baakio की मदद',
  problemOneTitle: '“अभी किससे पैसे लेने हैं?”',
  problemOneBody: 'खरीद और भुगतान कॉपी, मैसेज और याददाश्त में अलग-अलग रह जाते हैं।',
  problemOneSolution: 'हर ग्राहक का साफ बाकी एक जगह देखें।',
  problemTwoTitle: 'भुगतान का वादा भूल जाता है',
  problemTwoBody: 'दुकान की भागदौड़ में ग्राहक की दी हुई तारीख याद नहीं रहती।',
  problemTwoSolution: 'देय तारीख और फॉलो-अप एक आसान सूची में रखें।',
  problemThreeTitle: 'हर बिल लिखने में समय लगता है',
  problemThreeBody: 'हाथ से लिखे बिल दोबारा लिखने पड़ते हैं और छोटी गलती पकड़ना मुश्किल होता है।',
  problemThreeSolution: 'ड्राफ्ट बनाएँ, जाँचें और सही जानकारी ही सेव करें।',
  problemCta: 'Baakio कैसे मदद करता है',
  balanceTitle: 'ग्राहक का बकाया',
  balanceBody: 'किसका कितना बाकी है, देय तारीख और भुगतान का इतिहास देखें।',
  promiseTitle: 'भुगतान के वादे',
  promiseBody: 'वादे की तारीख देखें और जानें किससे बात करनी है।',
  entryTitle: 'आसान बिल एंट्री',
  entryBody: 'कुल रकम लिखें या बिल में हर सामान जोड़ें।',
  reminderTitle: 'साफ रिमाइंडर',
  reminderBody: 'WhatsApp पर भेजने के लिए भुगतान का संदेश तैयार करें।',
  howTitle: 'हर दिन इस्तेमाल करना आसान',
  howIntro: 'ग्राहक सूची से शुरू करें। Baakio सभी जानकारी साथ रखता है।',
  stepOneTitle: 'ग्राहक जोड़ें',
  stepOneBody: 'हर ग्राहक का नाम और संपर्क जानकारी रखें।',
  stepTwoTitle: 'बिल और भुगतान लिखें',
  stepTwoBody: 'उधार जोड़ें, भुगतान दर्ज करें और वादे की तारीख लिखें।',
  stepThreeTitle: 'साफ हिसाब से फॉलो-अप करें',
  stepThreeBody: 'देय रकम देखें और जरूरत पर रिमाइंडर भेजें।',
  localTitle: 'स्थानीय दुकानों के लिए।',
  localBody: 'छोटी दुकान हो या बढ़ता कारोबार, ग्राहक का उधार साफ और आसान रखें।',
  pricingTitle: 'आपकी दुकान के लिए आसान कीमत',
  pricingBody: 'कीमत की जानकारी जल्द आएगी। मौजूदा उपयोगकर्ता Baakio में लॉग इन कर सकते हैं।',
  faqTitle: 'आम सवाल',
  questionOne: 'Baakio में क्या हिसाब रख सकते हैं?',
  answerOne: 'ग्राहक का उधार, बिल, मिले हुए भुगतान और भुगतान के वादे।',
  questionTwo: 'क्या Baakio हिंदी में इस्तेमाल कर सकते हैं?',
  answerTwo: 'हां। Baakio अंग्रेजी और हिंदी में उपलब्ध है।',
  questionThree: 'क्या Baakio भुगतान लेता है?',
  answerThree: 'नहीं। Baakio भुगतान दर्ज करने और ग्राहक का बकाया देखने में मदद करता है।',
  questionFour: 'क्या बिल स्कैन कर सकते हैं?',
  answerFour: 'बिल स्कैन की सुविधा बन रही है। अभी बिल हाथ से दर्ज कर सकते हैं।',
  finalTitle: 'दुकान का हिसाब साफ रखें।',
  finalBody: 'आसान इस्तेमाल। आपके कारोबार के लिए।',
  footer: 'ग्राहकों का उधार और भुगतान साफ रखें।',
  menu: 'मेन्यू खोलें',
}

function Icon({ name }: { name: 'people' | 'calendar' | 'receipt' | 'message' | 'phone' | 'check' }) {
  const paths = {
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19zM16 5.4a3 3 0 0 1 0 5.8M17 13.5a4.5 4.5 0 0 1 3.5 4.4V19h-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h2" /></>,
    message: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.6-.9L4 20l1.6-4.1a7.5 7.5 0 1 1 14.4-4.4z" /><path d="M9 11h.01M12.5 11h.01M16 11h.01" /></>,
    phone: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M10 5h4M11 18.5h2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  }

  return <svg className="landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function LandingPage({ locale, onLocaleChange, onLogin, onRegister }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const copy = locale === 'hi-IN' ? hindi : english
  const closeMenu = () => setMenuOpen(false)
  const features = [
    { icon: 'people' as const, title: copy.balanceTitle, body: copy.balanceBody },
    { icon: 'calendar' as const, title: copy.promiseTitle, body: copy.promiseBody },
    { icon: 'receipt' as const, title: copy.entryTitle, body: copy.entryBody },
    { icon: 'message' as const, title: copy.reminderTitle, body: copy.reminderBody },
  ]
  const steps = [
    { number: '01', title: copy.stepOneTitle, body: copy.stepOneBody },
    { number: '02', title: copy.stepTwoTitle, body: copy.stepTwoBody },
    { number: '03', title: copy.stepThreeTitle, body: copy.stepThreeBody },
  ]
  const values = [
    { icon: 'check' as const, label: copy.valueEnglish },
    { icon: 'phone' as const, label: copy.valueMobile },
    { icon: 'receipt' as const, label: copy.valueSimple },
    { icon: 'message' as const, label: copy.valueReminder },
  ]

  return <main className="landing-page" id="top">
    <header className="landing-header">
      <div className="landing-header-inner">
        <a className="landing-brand" href="#top" aria-label="Baakio home" onClick={closeMenu}>
          <img className="landing-wordmark" src="/brand/baakio-logo.png" alt="Baakio" />
          <small>{copy.tagline}</small>
        </a>
        <button className="landing-menu-toggle" type="button" aria-label={copy.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? '×' : '☰'}
        </button>
        <nav className={`landing-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <a href="#why" onClick={closeMenu}>{copy.whyBaakio}</a>
          <a href="#features" onClick={closeMenu}>{copy.features}</a>
          <a href="#how-it-works" onClick={closeMenu}>{copy.howItWorks}</a>
          <a href="#pricing" onClick={closeMenu}>{copy.pricing}</a>
          <a href="#faq" onClick={closeMenu}>{copy.faq}</a>
          <div className="landing-mobile-actions">
            <button className="landing-button landing-button-plain" type="button" onClick={() => { closeMenu(); onLocaleChange(locale === 'en-IN' ? 'hi-IN' : 'en-IN') }}>
              {locale === 'en-IN' ? 'हिन्दी' : 'English'}
            </button>
            <button className="landing-button landing-button-outline" type="button" onClick={() => { closeMenu(); onLogin() }}>{copy.logIn}</button>
            <button className="landing-button landing-button-dark" type="button" onClick={() => { closeMenu(); onRegister() }}>{copy.getStarted}<span aria-hidden="true">→</span></button>
          </div>
        </nav>
        <div className="landing-desktop-actions">
          <button className="landing-button landing-button-plain" type="button" onClick={() => onLocaleChange(locale === 'en-IN' ? 'hi-IN' : 'en-IN')}>
            {locale === 'en-IN' ? 'हिन्दी' : 'English'}
          </button>
          <button className="landing-button landing-button-outline" type="button" onClick={onLogin}>{copy.logIn}</button>
          <button className="landing-button landing-button-dark" type="button" onClick={onRegister}>{copy.getStarted}<span aria-hidden="true">→</span></button>
        </div>
      </div>
    </header>

    <section className="landing-hero">
      <div className="landing-shell landing-hero-grid">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span />{copy.label}</div>
          <h1>{copy.title}</h1>
          <p className="landing-lead">{copy.intro}</p>
          <div className="landing-hero-actions">
            <button className="landing-button landing-button-dark landing-button-large" type="button" onClick={onRegister}>{copy.getStarted}<span aria-hidden="true">→</span></button>
            <a className="landing-button landing-button-outline landing-button-large" href="#demo">{copy.demo}<span aria-hidden="true">↓</span></a>
          </div>
          <p className="landing-helper">{copy.valueEnglish} <span aria-hidden="true">·</span> {copy.valueMobile}</p>
        </div>

        <div className="landing-preview" id="demo" aria-label={copy.demoLabel}>
          <div className="preview-decoration preview-decoration-one" />
          <div className="preview-decoration preview-decoration-two" />
          <section className="preview-window">
            <div className="preview-browser-bar"><span className="preview-dots"><i /><i /><i /></span><span className="preview-label">{copy.demoLabel}</span><span className="preview-menu-dots">···</span></div>
            <div className="preview-topbar"><span>baakio<span>.</span></span><small>MY BUSINESS</small></div>
            <div className="preview-content">
              <p className="preview-greeting">{copy.greeting}</p>
              <div className="preview-balance">
                <span>{copy.total}</span>
                <strong>₹22,000</strong>
                <small>{copy.customers}</small>
              </div>
              <div className="preview-stats">
                <div><span>{copy.received}</span><strong>₹8,500</strong></div>
                <div><span>{copy.dueToday}</span><strong>₹4,000</strong></div>
              </div>
              <div className="preview-list-head"><strong>{copy.recent}</strong><span>•••</span></div>
              <div className="preview-customer"><span className="preview-avatar">R</span><span><b>Ravi Kumar</b><small>Bill · 12 Sep</small></span><strong>₹7,000</strong></div>
              <div className="preview-customer"><span className="preview-avatar preview-avatar-light">A</span><span><b>Anita Shah</b><small>Bill · 14 Sep</small></span><strong>₹3,200</strong></div>
              <div className="preview-customer"><span className="preview-avatar preview-avatar-gold">N</span><span><b>New Star Stores</b><small>Bill · 17 Sep</small></span><strong>₹2,800</strong></div>
            </div>
          </section>
          <section className="preview-phone" aria-hidden="true">
            <div className="preview-phone-notch" />
            <div className="preview-phone-screen">
              <div className="preview-phone-brand">baakio<span>.</span></div>
              <small>{copy.total}</small>
              <strong>₹22,000</strong>
              <div className="preview-phone-row"><span>{copy.received}</span><b>₹8,500</b></div>
              <div className="preview-phone-row"><span>{copy.dueToday}</span><b>₹4,000</b></div>
              <div className="preview-phone-button">+ {copy.getStarted}</div>
            </div>
          </section>
        </div>
      </div>
    </section>

    <section className="landing-value-strip" aria-label="Baakio benefits">
      <div className="landing-shell landing-value-grid">
        {values.map((value) => <div className="landing-value" key={value.label}><span className="landing-value-icon"><Icon name={value.icon} /></span><span>{value.label}</span></div>)}
      </div>
    </section>

    <section className="landing-problem" id="why">
      <div className="landing-shell landing-problem-grid">
        <div className="landing-problem-intro">
          <span className="landing-section-kicker">{copy.whyBaakio}</span>
          <h2>{copy.problemTitle}</h2>
          <p>{copy.problemIntro}</p>
          <a className="landing-button landing-button-outline" href="#features">{copy.problemCta}<span aria-hidden="true">↓</span></a>
        </div>
        <div className="landing-problem-list">
          {[
            { icon: 'receipt' as const, title: copy.problemOneTitle, body: copy.problemOneBody, solution: copy.problemOneSolution },
            { icon: 'calendar' as const, title: copy.problemTwoTitle, body: copy.problemTwoBody, solution: copy.problemTwoSolution },
            { icon: 'message' as const, title: copy.problemThreeTitle, body: copy.problemThreeBody, solution: copy.problemThreeSolution },
          ].map((problem) => <article className="landing-problem-card" key={problem.title}>
            <span className="landing-problem-icon"><Icon name={problem.icon} /></span>
            <div><span className="landing-problem-label">{copy.problemLabel}</span><h3>{problem.title}</h3><p>{problem.body}</p><div className="landing-problem-solution"><Icon name="check" /><span><b>{copy.solutionLabel}:</b> {problem.solution}</span></div></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="landing-section" id="features">
      <div className="landing-shell">
        <div className="landing-section-heading">
          <span className="landing-section-kicker">BAAKIO</span>
          <h2>{copy.featureTitle}</h2>
          <p>{copy.featureIntro}</p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => <article className="landing-feature-card" key={feature.title} tabIndex={0}>
            <span className="landing-feature-icon"><Icon name={feature.icon} /></span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="landing-how" id="how-it-works">
      <div className="landing-shell landing-how-grid">
        <div className="landing-how-copy">
          <span className="landing-section-kicker">{copy.howItWorks}</span>
          <h2>{copy.howTitle}</h2>
          <p>{copy.howIntro}</p>
          <button className="landing-button landing-button-dark" type="button" onClick={onRegister}>{copy.getStarted}<span aria-hidden="true">→</span></button>
        </div>
        <div className="landing-steps">
          {steps.map((step) => <article className="landing-step" key={step.number} tabIndex={0}>
            <span className="landing-step-number">{step.number}</span>
            <div><h3>{step.title}</h3><p>{step.body}</p></div>
            <Icon name="check" />
          </article>)}
        </div>
      </div>
    </section>

    <section className="landing-local">
      <div className="landing-shell landing-local-card">
        <div className="landing-local-copy">
          <span className="landing-section-kicker">{copy.label}</span>
          <h2>{copy.localTitle}</h2>
          <p>{copy.localBody}</p>
        </div>
        <div className="shop-art" aria-hidden="true">
          <div className="shop-art-plant"><i /><i /><i /><span /></div>
          <div className="shop-art-store">
            <div className="shop-art-sign">My Business</div>
            <div className="shop-art-awning"><i /><i /><i /><i /><i /></div>
            <div className="shop-art-window"><span /><span /><b /></div>
          </div>
          <div className="shop-art-bill"><span>INVOICE</span><i /><i /><i /><b>₹ 2,400</b></div>
          <div className="shop-art-bag" />
        </div>
      </div>
    </section>

    <section className="landing-pricing" id="pricing">
      <div className="landing-shell landing-pricing-inner">
        <div><span className="landing-section-kicker">{copy.pricing}</span><h2>{copy.pricingTitle}</h2><p>{copy.pricingBody}</p></div>
        <button className="landing-button landing-button-outline" type="button" onClick={onLogin}>{copy.logIn}<span aria-hidden="true">→</span></button>
      </div>
    </section>

    <section className="landing-section landing-faq" id="faq">
      <div className="landing-shell landing-faq-grid">
        <div className="landing-section-heading landing-faq-heading"><span className="landing-section-kicker">FAQ</span><h2>{copy.faqTitle}</h2></div>
        <div className="landing-faq-list">
          <details><summary>{copy.questionOne}</summary><p>{copy.answerOne}</p></details>
          <details><summary>{copy.questionTwo}</summary><p>{copy.answerTwo}</p></details>
          <details><summary>{copy.questionThree}</summary><p>{copy.answerThree}</p></details>
          <details><summary>{copy.questionFour}</summary><p>{copy.answerFour}</p></details>
        </div>
      </div>
    </section>

    <section className="landing-final-cta">
      <div className="landing-shell landing-final-inner"><div><h2>{copy.finalTitle}</h2><p>{copy.finalBody}</p></div>
        <button className="landing-button landing-button-light" type="button" onClick={onRegister}>{copy.getStarted}<span aria-hidden="true">→</span></button>
      </div>
    </section>

    <footer className="landing-footer"><div className="landing-shell"><a className="landing-brand" href="#top"><img className="landing-wordmark" src="/brand/baakio-logo.png" alt="Baakio" /><small>{copy.tagline}</small></a><p>{copy.footer}</p><div className="landing-footer-contact" aria-label="Contact Baakio"><a href="https://wa.me/918738074517" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9.2 8.4c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.2.7l-.5.5c.6 1.2 1.5 2.1 2.8 2.7l.5-.5c.2-.2.4-.3.7-.2l1.5.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.4.7-.6.3-1.2.4-1.8.2-2.3-.7-4.9-3.4-5.7-5.7-.2-.6-.1-1.2.2-1.8Z"/></svg></a><a href="https://x.com/Dev_Sanjay2004" target="_blank" rel="noreferrer" aria-label="X" title="X"><svg className="x-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4 19 20M19 4 5 20"/></svg></a></div><nav className="landing-footer-links" aria-label={copy.policies}><a className="landing-footer-demo" href="/demo.html">{copy.demo}</a><a href="/privacy.html">{copy.privacy}</a><a href="/terms.html">{copy.terms}</a></nav><span>© {new Date().getFullYear()} Baakio</span></div></footer>
  </main>
}
