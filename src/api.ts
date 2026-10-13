import { ApiError } from './types'

const apiRoot = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function csrfCookie(): string | null {
  const item = document.cookie.split('; ').find((cookie) => cookie.startsWith('XSRF-TOKEN='))
  return item ? decodeURIComponent(item.slice('XSRF-TOKEN='.length)) : null
}

async function csrfToken(): Promise<string> {
  const sameOrigin = !apiRoot || new URL(apiRoot, window.location.href).origin === window.location.origin
  const cookie = sameOrigin ? csrfCookie() : null
  if (cookie) return cookie
  const response = await fetch(`${apiRoot}/api/v1/csrf`, { credentials: 'include' })
  if (!response.ok) throw new ApiError('Could not start a secure session.', 'CSRF_UNAVAILABLE')
  const payload = (await response.json()) as { token: string }
  return (sameOrigin && csrfCookie()) || payload.token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-XSRF-TOKEN', await csrfToken())
  const response = await fetch(`${apiRoot}${path}`, { ...options, method, headers, credentials: 'include' })
  if (!response.ok) {
    let problem: { detail?: string; code?: string } = {}
    try {
      problem = await response.json() as typeof problem
    } catch {
      problem = {}
    }
    throw new ApiError(problem.detail || `Request failed (${response.status}).`, problem.code || `HTTP_${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getBlob: async (path: string): Promise<Blob> => {
    const response = await fetch(`${apiRoot}${path}`, { credentials: 'include' })
    if (!response.ok) {
      let problem: { detail?: string; code?: string } = {}
      try { problem = await response.json() as typeof problem } catch { problem = {} }
      throw new ApiError(problem.detail || `Request failed (${response.status}).`, problem.code || `HTTP_${response.status}`)
    }
    return response.blob()
  },
  post: <T>(path: string, body: unknown, idempotencyKey?: string) => {
    const headers = new Headers()
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
    return request<T>(path, { method: 'POST', headers, body: JSON.stringify(body) })
  },
  upload: <T>(path: string, body: FormData, idempotencyKey: string) => {
    const headers = new Headers({ 'Idempotency-Key': idempotencyKey })
    return request<T>(path, { method: 'POST', headers, body })
  },
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function query(values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
