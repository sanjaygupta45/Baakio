(() => {
  const demo = window.baakioDemo
  if (!demo) return

  const state = demo.state
  const tour = document.getElementById('demo-tour')
  const stepLabel = document.getElementById('demo-tour-step')
  const title = document.getElementById('demo-tour-title')
  const progress = document.getElementById('demo-tour-progress')
  const back = document.getElementById('demo-tour-back')
  const toggle = document.getElementById('demo-tour-toggle')
  const next = document.getElementById('demo-tour-next')
  if (!tour || !stepLabel || !title || !progress || !back || !toggle || !next) return

  const steps = [
    { screen: 'home', title: 'Start with today', body: 'See what is due and who needs a follow-up.' },
    { screen: 'account', title: 'Open one customer', body: 'See purchases, payments and the balance in one place.', prepare: () => { state.customer = 1; state.tab = 'activity' } },
    { screen: 'purchase', title: 'Add the new sale', body: 'Enter a quick total or list the products on the bill.', prepare: () => { state.customer = 1; state.mode = 'quick' } },
    { screen: 'payment', title: 'Record money received', body: 'Only mark money as paid after you have checked it.', prepare: () => { state.customer = 1; state.paymentPromise = null } },
    { screen: 'promise', title: 'Save the next promise', body: 'Keep the promised amount and date easy to remember.', prepare: () => { state.customer = 1 } },
    { screen: 'review', title: 'Check the bill scan', body: 'AI prepares a draft. You check it before it reaches the account.', prepare: () => { state.scanCustomer = 1; state.draft = { lines: [{ name: 'Cement', qty: '10', rate: '400' }, { name: 'Sariya', qty: '25', rate: '100' }, { name: 'PVC Pipe', qty: '4', rate: '250' }] } } },
    { screen: 'share', title: 'Send a friendly reminder', body: 'Review the amount, then open WhatsApp yourself.', prepare: () => { state.customer = 1; state.reminderMode = 'short'; state.reminderLocale = 'en' } },
  ]

  let current = 0
  let running = true
  let started = false
  let timer = 0
  let progressTimer = 0
  const stepDuration = 4800

  function clearTimers() {
    window.clearTimeout(timer)
    window.clearInterval(progressTimer)
  }

  function renderStep() {
    const step = steps[current]
    state.screen = step.screen
    state.prev = current === 0 ? 'home' : steps[current - 1].screen
    step.prepare?.()
    demo.render()
    stepLabel.textContent = current === steps.length - 1 ? 'Final step' : `Step ${current + 1} of ${steps.length}`
    title.textContent = step.title
    progress.style.width = `${((current + 1) / steps.length) * 100}%`
    tour.classList.toggle('is-paused', !running)
    toggle.textContent = running ? 'Ⅱ' : '▶'
    toggle.setAttribute('aria-label', running ? 'Pause demo' : 'Play demo')
    next.textContent = current === steps.length - 1 ? '↻' : '→'
    next.setAttribute('aria-label', current === steps.length - 1 ? 'Restart demo' : 'Next demo step')
  }

  function schedule() {
    clearTimers()
    if (!running) return
    const startedAt = Date.now()
    progress.style.width = `${((current + 1) / steps.length) * 100}%`
    progressTimer = window.setInterval(() => {
      const elapsed = Math.min(stepDuration, Date.now() - startedAt)
      const base = current / steps.length
      const withinStep = (elapsed / stepDuration) / steps.length
      progress.style.width = `${Math.min(100, (base + withinStep) * 100)}%`
    }, 80)
    timer = window.setTimeout(() => {
      if (current < steps.length - 1) {
        current += 1
        renderStep()
        schedule()
      } else {
        running = false
        renderStep()
        clearTimers()
      }
    }, stepDuration)
  }

  function start() {
    if (started) return
    started = true
    current = 0
    running = true
    renderStep()
    schedule()
  }

  toggle.addEventListener('click', () => {
    running = !running
    tour.classList.toggle('is-paused', !running)
    toggle.textContent = running ? 'Ⅱ' : '▶'
    toggle.setAttribute('aria-label', running ? 'Pause demo' : 'Play demo')
    if (running) schedule(); else clearTimers()
  })

  back.addEventListener('click', () => {
    clearTimers()
    if (current > 0) current -= 1
    else current = 0
    running = true
    renderStep()
    schedule()
  })

  next.addEventListener('click', () => {
    clearTimers()
    if (current >= steps.length - 1) current = 0
    else current += 1
    running = true
    renderStep()
    schedule()
  })

  document.getElementById('screen')?.addEventListener('click', (event) => {
    if (event.target.closest('button, input, select, textarea, a')) {
      running = false
      clearTimers()
      tour.classList.add('is-paused')
      toggle.textContent = '▶'
      toggle.setAttribute('aria-label', 'Play demo')
    }
  })

  window.setTimeout(start, 900)
})()
