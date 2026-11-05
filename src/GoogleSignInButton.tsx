import { useEffect, useRef } from 'react'

interface GoogleApi {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        callback: (response: { credential: string }) => void
        cancel_on_tap_outside?: boolean
      }) => void
      renderButton: (element: HTMLElement, options: { theme: string; size: string; locale: string; text: string }) => void
      prompt: () => void
      cancel: () => void
    }
  }
}

declare global {
  interface Window { google?: GoogleApi }
}

let scriptPromise: Promise<GoogleApi> | null = null
let initializedClientId = ''
let currentHandler: ((credential: string) => void) | null = null

function loadGoogle(): Promise<GoogleApi> {
  if (window.google) return Promise.resolve(window.google)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => {
        if (window.google) resolve(window.google)
        else { scriptPromise = null; reject(new Error('Google sign-in could not load.')) }
      }
      script.onerror = () => { scriptPromise = null; reject(new Error('Google sign-in could not load.')) }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export default function GoogleSignInButton({ clientId, locale, onCredential, onError, autoPrompt = false }: {
  clientId: string
  locale: string
  onCredential: (credential: string) => void
  onError: () => void
  autoPrompt?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const credentialHandler = useRef(onCredential)
  const errorHandler = useRef(onError)
  useEffect(() => { credentialHandler.current = onCredential; errorHandler.current = onError }, [onCredential, onError])
  useEffect(() => {
    let active = true
    const handleCredential = (credential: string) => credentialHandler.current(credential)
    currentHandler = handleCredential
    void loadGoogle().then((google) => {
      if (!active || !container.current) return
      if (initializedClientId !== clientId) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => currentHandler?.(response.credential),
          cancel_on_tap_outside: true,
        })
        initializedClientId = clientId
      }
      container.current.replaceChildren()
      google.accounts.id.renderButton(container.current, {
        theme: 'outline', size: 'large', locale: locale === 'hi-IN' ? 'hi' : 'en', text: 'continue_with',
      })
      if (autoPrompt) {
        window.setTimeout(() => { if (active) google.accounts.id.prompt() }, 0)
      }
    }).catch(() => { if (active) errorHandler.current() })
    return () => {
      active = false
      if (autoPrompt) window.google?.accounts.id.cancel()
      if (currentHandler === handleCredential) currentHandler = null
    }
  }, [autoPrompt, clientId, locale])
  return <div ref={container} className="google-sign-in" aria-label="Continue with Google" />
}
