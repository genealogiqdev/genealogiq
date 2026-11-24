import { API_ORIGINS, type SystemId } from '@/config'
import { tokenFor, useSession } from '@/auth/session'
import { toStoredSession } from '@/auth/session-shape'
import { currentLocale } from '@/i18n/locale'

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; message: string }

export type ActionResponse<T = unknown> = ActionResult<T> & {
  /** Where the web would have navigated after this action. */
  redirect?: string
  fieldErrors?: Record<string, string[] | undefined>
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'invalidData'
  | 'tooManyRequests'
  | 'accountLocked'
  | 'verifyEmailFirst'
  | 'incorrectCredentials'
  | 'wrongSystem'
  | 'unknownOperation'
  | 'serverError'
  | 'network'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    public readonly values?: Record<string, string | number>,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export type Params = Record<string, string | number | boolean | undefined | null>

export function absoluteUrl(system: SystemId, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_ORIGINS[system]}${path.startsWith('/') ? path : `/${path}`}`
}

export function authHeaders(system: SystemId): Record<string, string> {
  const token = tokenFor(system)
  return {
    'Accept-Language': currentLocale(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'invalidData',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  429: 'tooManyRequests',
}

/**
 * Low-level request against one system's backend. Throws ApiError for every
 * non-2xx response. A 401 on a request that carried a token means the token no
 * longer holds (expired, account deactivated, role removed), so that system's
 * session is dropped and the navigation guards return the user to sign-in.
 */
export async function http<T>(system: SystemId, path: string, init: RequestInit = {}): Promise<T> {
  const hadToken = tokenFor(system) !== null
  let response: Response
  try {
    response = await fetch(absoluteUrl(system, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(system),
        ...(init.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    throw new ApiError(0, 'network')
  }

  let body: unknown = null
  let isJson = false
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
      isJson = true
    } catch {
      body = null
    }
  }

  // Every mobile route answers JSON. A successful answer that is not JSON
  // (or is empty) means this server does not run the mobile API, e.g. a
  // web "not found" page served with status 200. Never treat it as success.
  if (response.ok && !isJson && response.status !== 204) {
    throw new ApiError(404, 'unknownOperation')
  }

  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error
    const structured =
      typeof error === 'object' && error !== null
        ? (error as { code?: ApiErrorCode; values?: Record<string, string | number> })
        : null
    const code = structured?.code ?? STATUS_CODES[response.status] ?? 'serverError'
    if (response.status === 401 && hadToken) await useSession.getState().signOut(system)
    throw new ApiError(response.status, code, structured?.values)
  }
  return body as T
}

export function toQuery(params?: Params): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Read one screen's data: GET /api/mobile/v1/views/<name>. */
export async function view<T>(system: SystemId, name: string, params?: Params): Promise<T> {
  const body = await http<{ data: T }>(system, `/api/mobile/v1/views/${encodeURIComponent(name)}${toQuery(params)}`)
  return body.data
}

/** Run one server action: POST /api/mobile/v1/actions/<name>. */
export async function action<T = unknown>(
  system: SystemId,
  name: string,
  input: { args?: unknown[]; form?: Record<string, unknown> } = {},
): Promise<ActionResponse<T>> {
  const body = await http<{ result: ActionResult<T> | null; redirect?: string }>(
    system,
    `/api/mobile/v1/actions/${encodeURIComponent(name)}`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const result = (body.result ?? { ok: true }) as ActionResponse<T>
  return body.redirect ? { ...result, redirect: body.redirect } : result
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: { id: string; name: string; email: string; image: string | null; role: string; customerId?: string }
}

export async function login(system: SystemId, email: string, password: string): Promise<LoginResponse> {
  const body = await http<unknown>(system, '/api/mobile/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const session = toStoredSession(body)
  if (!session) throw new ApiError(502, 'unknownOperation')
  return session
}
