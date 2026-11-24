import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/auth/session', () => ({ tokenFor: () => null, useSession: { getState: () => ({ signOut }) } }))
vi.mock('@/i18n/locale', () => ({ currentLocale: () => 'en-US' }))

import { ApiError, action, login, view } from './client'

function reply(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })))
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

beforeEach(() => vi.unstubAllGlobals())

describe('a server without the mobile API', () => {
  // What production answered on 2026-11-24: its web "not found" page, with HTTP 200.
  const NOT_FOUND_PAGE = '<!DOCTYPE html><html lang="en-US"><head><title>Genealogiq</title></head><body>Not found</body></html>'

  it('makes sign-in fail instead of returning an empty session', async () => {
    reply(200, NOT_FOUND_PAGE, 'text/html; charset=utf-8')
    const error = await errorOf(login('app', 'ana@example.com', 'secret-pass'))
    expect(error.code).toBe('unknownOperation')
    expect(error.status).toBe(404)
  })

  it('makes views and actions fail too', async () => {
    reply(200, NOT_FOUND_PAGE, 'text/html; charset=utf-8')
    expect((await errorOf(view('app', 'home'))).code).toBe('unknownOperation')
    expect((await errorOf(action('seq', 'createCustomer', { args: [{}] }))).code).toBe('unknownOperation')
  })

  it('treats an empty successful body as missing too', async () => {
    reply(200, '')
    expect((await errorOf(view('bms', 'dashboard'))).code).toBe('unknownOperation')
  })
})

describe('sign-in responses', () => {
  it('rejects JSON that is not a session', async () => {
    for (const body of ['{}', 'null', '{"token":"","expiresAt":"2026-12-24T00:00:00Z","user":{"id":"u1","role":"APP_USER"}}', '{"token":"t","expiresAt":"soon","user":{"id":"u1","role":"APP_USER"}}', '{"token":"t","expiresAt":"2026-12-24T00:00:00Z","user":{"role":"APP_USER"}}']) {
      reply(200, body)
      expect((await errorOf(login('app', 'ana@example.com', 'pw'))).code, body).toBe('unknownOperation')
    }
  })

  it('returns a well-formed session', async () => {
    reply(200, JSON.stringify({ token: 'tok', expiresAt: '2026-12-24T00:00:00.000Z', user: { id: 'u1', name: 'Ana', email: 'ana@example.com', image: null, role: 'OWNER', customerId: 't1' } }))
    expect(await login('seq', 'ana@example.com', 'pw')).toEqual({
      token: 'tok',
      expiresAt: '2026-12-24T00:00:00.000Z',
      user: { id: 'u1', name: 'Ana', email: 'ana@example.com', image: null, role: 'OWNER', customerId: 't1' },
    })
  })

  it('keeps the coded errors of the real API', async () => {
    reply(401, '{"error":{"code":"incorrectCredentials"}}')
    expect((await errorOf(login('app', 'ana@example.com', 'nope'))).code).toBe('incorrectCredentials')
    reply(423, '{"error":{"code":"accountLocked","values":{"minutes":12}}}')
    const locked = await errorOf(login('app', 'ana@example.com', 'nope'))
    expect([locked.code, locked.values]).toEqual(['accountLocked', { minutes: 12 }])
  })
})
