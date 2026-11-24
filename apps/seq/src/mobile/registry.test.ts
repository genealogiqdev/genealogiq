import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The registry is exercised through the REAL guards (dal, customer-access) and
 * the REAL queries/actions. Only the two leaves are replaced: `auth()` (who is
 * calling) and Prisma (an in-memory store that honours `where` scalars and
 * `select`). A view that forgot the tenant in its `where`, or loaded a row
 * without a `select`, therefore fails here.
 */

type Row = Record<string, unknown>

const { authMock, store, writes, prismaMock } = vi.hoisted(() => {
  const store: Record<string, Row[]> = {}
  const writes: { model: string; method: string; args: unknown }[] = []

  const isPlain = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value)
  const matches = (row: Row, where: Row | undefined) =>
    Object.entries(where ?? {}).every(([key, value]) => (isPlain(value) ? row[key] === value : true))
  const pick = (row: Row, select: Row | undefined) =>
    select ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]])) : row
  const rows = (model: string) => store[model] ?? []

  const model = (name: string) => ({
    findUnique: async (query: { where?: Row; select?: Row }) => {
      const row = rows(name).find((candidate) => matches(candidate, query.where))
      return row ? pick(row, query.select) : null
    },
    findFirst: async (query: { where?: Row; select?: Row }) => {
      const row = rows(name).find((candidate) => matches(candidate, query.where))
      return row ? pick(row, query.select) : null
    },
    findMany: async (query: { where?: Row; select?: Row; take?: number } = {}) =>
      rows(name).filter((candidate) => matches(candidate, query.where))
        .slice(0, query.take ?? undefined).map((row) => pick(row, query.select)),
    count: async (query: { where?: Row } = {}) => rows(name).filter((candidate) => matches(candidate, query.where)).length,
    update: async (args: { where?: Row; data?: Row }) => {
      writes.push({ model: name, method: 'update', args })
      const row = rows(name).find((candidate) => matches(candidate, args.where))
      if (row) Object.assign(row, args.data)
      return row ?? null
    },
    delete: async (args: { where?: Row }) => {
      writes.push({ model: name, method: 'delete', args })
      store[name] = rows(name).filter((candidate) => !matches(candidate, args.where))
      return null
    },
    create: async (args: unknown) => { writes.push({ model: name, method: 'create', args }); return { id: 'created' } },
    updateMany: async (args: unknown) => { writes.push({ model: name, method: 'updateMany', args }); return { count: 0 } },
    deleteMany: async (args: unknown) => { writes.push({ model: name, method: 'deleteMany', args }); return { count: 0 } },
  })

  const models: Record<string, ReturnType<typeof model>> = {}
  const prismaMock = new Proxy({} as Record<string, unknown>, {
    get(_target, key: string) {
      if (key === '$transaction') {
        return async (input: unknown) =>
          Array.isArray(input) ? Promise.all(input) : (input as (tx: unknown) => unknown)(prismaMock)
      }
      if (key === 'then') return undefined
      return (models[key] ??= model(key))
    },
  })

  return { authMock: vi.fn(), store, writes, prismaMock }
})

vi.mock('@/auth', () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn(), mobileAuth: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn(), sendEmailChangeEmail: vi.fn(), sendPasswordResetEmail: vi.fn(),
  sendAccountDeletionEmail: vi.fn(), sendWelcomeEmail: vi.fn(), sendAppWelcomeEmail: vi.fn(),
  sendGenCodeDeliveryEmail: vi.fn(), sendFeedback: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'pt-BR',
}))

import { hashToken } from '@genealogiq/core'
import { createActionRoute, createViewRoute, type MobileActionInput } from '@genealogiq/auth/mobile'
import { actions, publicActions } from './actions'
import { views, publicViews } from './views'

const SIGN_IN = 'NEXT_REDIRECT;replace;/sign-in;307;'
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404'
const FORBIDDEN = 'NEXT_HTTP_ERROR_FALLBACK;403'

/** 'resolved', or the control-flow digest the guard threw. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(() => 'resolved', (error: { digest?: string; message?: string }) => error?.digest ?? `error:${error?.message}`)

const request = new Request('http://localhost/api/mobile/v1/views/x')
const run = (name: string, params: Record<string, string> = {}) => views[name](params, request)
const input = (list: unknown[] = [], fields: Record<string, string> = {}): MobileActionInput => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return { args: list, form }
}

function signIn(user: 'owner-a' | 'staff-a' | 'owner-b' | 'no-tenant' | null) {
  const sessions = {
    'owner-a': { id: 'owner-a', role: 'OWNER', customerId: 'tenant-a' },
    'staff-a': { id: 'staff-a', role: 'USER', customerId: 'tenant-a' },
    'owner-b': { id: 'owner-b', role: 'OWNER', customerId: 'tenant-b' },
    'no-tenant': { id: 'bms-only', role: 'SUPER_ADMIN' },
  }
  authMock.mockResolvedValue(user
    ? { user: { name: 'Test User', email: `${user}@example.test`, image: null, ...sessions[user] } }
    : null)
}

const soldAt = new Date('2026-11-01T12:00:00Z')
function seed() {
  for (const key of Object.keys(store)) delete store[key]
  writes.length = 0
  const staff = (id: string, role: string, tenantId: string) => ({
    id, role, tenantId, firstName: 'Staff', lastName: id, email: `${id}@example.test`, password: 'hash-secret',
    avatarUrl: null, nationalId: null, birthDate: null, phoneCountryCode: '55', phone: null, isActive: true,
    createdAt: soldAt, address: null, tenant: { isActive: true },
  })
  store.user = [staff('owner-a', 'OWNER', 'tenant-a'), staff('staff-a', 'USER', 'tenant-a'), staff('owner-b', 'OWNER', 'tenant-b')]
  store.tenant = [
    { id: 'tenant-a', name: 'Tenant A Ltda', tradeName: 'Tenant A', isActive: true, moduleRecordsSuppliers: true, moduleCategoriesSuppliers: true, address: null },
    { id: 'tenant-b', name: 'Tenant B Ltda', tradeName: 'Tenant B', isActive: true, moduleRecordsSuppliers: false, moduleCategoriesSuppliers: false, address: null },
  ]
  store.subscription = [{ code: 'FREE', name: 'Free', memorialsMax: 1, petsMax: 0, qrCodeMax: 1 }]
  store.appUser = [
    { id: 'customer-a', tenantId: 'tenant-a', role: 'APP_USER', firstName: 'Ana', lastName: 'Silva', email: 'ana@example.test',
      isActive: true, password: 'hash-secret', address: null, _count: { genCodesBought: 0 }, guardiansOf: [], appSales: [],
      extraUnitPurchases: [], consumerAccessGrants: [] },
    { id: 'memorial-a', tenantId: 'tenant-a', role: 'APP_MEMO', firstName: 'Joao', lastName: 'Silva', deathPlace: null,
      guardedBy: [], geolocation: null, qrCode: null },
  ]
  store.appUserCategory = [{ id: 'cat-a', tenantId: 'tenant-a', name: 'Familias A', description: 'Categoria A', isActive: true }]
  store.supplierCategory = [{ id: 'supcat-a', tenantId: 'tenant-a', name: 'Graniteiras', description: 'Fornecedores A', isActive: true }]
  store.supplier = [{ id: 'supplier-a', tenantId: 'tenant-a', name: 'Granito A', address: null }]
  const code = (genCode: string, status: string) => ({ genCode, status, soldAt, soldToAppUserId: null, soldToAppUser: null,
    reservation: { status: 'HELD', expiresAt: null } })
  store.businessCustomer = [{
    id: 'biz-a', tenantId: 'tenant-a', name: 'Funeraria A', tradeName: 'A', taxId: '1', segment: 'FUNERAL_HOME', contactName: '',
    email: '', phoneCountryCode: '55', phone: '', notes: null, isActive: true, address: null,
    sales: [{ id: 'sale-a', quantity: 2, unitValue: null, createdAt: soldAt, codes: ['LOTA1', 'LOTA2'],
      genCodes: [code('LOTA1', 'SOLD'), code('LOTA2', 'ACTIVATED')] }],
  }]
  const stock = (genCode: string, tenantId: string) => ({ id: `id-${genCode}`, genCode, tenantId, status: 'AVAILABLE', printedAt: null,
    soldAt: null, soldVia: null, soldToName: null, soldValue: null, activatedAt: null, createdAt: soldAt,
    appUser: null, soldToAppUser: null, soldBy: null })
  store.genCode = [stock('STOCKA1', 'tenant-a'), stock('STOCKB1', 'tenant-b'), stock('STOCKA2', 'tenant-a')]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS', 'true')
  vi.stubEnv('APP_URL', 'https://app.example.test')
  seed()
})
afterEach(() => { vi.unstubAllEnvs() })

describe('registry surface', () => {
  it('exposes no public view and exactly three public actions', () => {
    expect([...publicViews]).toEqual([])
    expect([...publicActions]).toEqual(['forgotPassword', 'resetPassword', 'verifyEmail'])
    for (const name of publicActions) expect(actions).toHaveProperty(name)
  })

  it('registers one view per authenticated screen and export', () => {
    expect(Object.keys(views).sort()).toEqual([
      'activation', 'activations', 'businessCustomer', 'businessCustomerNew', 'businessCustomers',
      'businessLotCodes', 'businessLotPrintSheet', 'company', 'customer', 'customerCategories',
      'customerCategory', 'customerNew', 'customers', 'dashboard', 'me', 'memorial', 'profile',
      'purchasingPackages', 'purchasingPlans', 'stockPrintBatch', 'supplier', 'supplierCategories',
      'supplierCategory', 'supplierCategoryNew', 'supplierNew', 'suppliers', 'user', 'users',
    ])
  })

  it('registers every exported server action except login, logout and setupSystem', () => {
    const dir = fileURLToPath(new URL('../actions/', import.meta.url))
    const exported = readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .flatMap((file) => [...readFileSync(dir + file, 'utf8').matchAll(/^export async function (\w+)/gm)].map((match) => match[1]))
    expect(exported.length).toBeGreaterThan(50)

    const excluded = ['login', 'logout', 'setupSystem']
    const expected = [...exported.filter((name) => !excluded.includes(name)), 'verifyEmail'].sort()
    expect(Object.keys(actions).sort()).toEqual(expected)
    for (const name of excluded) expect(actions).not.toHaveProperty(name)
  })

  it('keeps the GenCode-consuming QR read out of the views', () => {
    expect(views).not.toHaveProperty('getCustomerMemorialQr')
    expect(actions).toHaveProperty('getCustomerMemorialQr')
  })
})

describe('view guards', () => {
  const anyParams = { id: 'customer-a', genCode: 'STOCKA1', customerId: 'biz-a', saleId: 'sale-a', quantity: '1' }

  it.each(Object.keys(views))('%s rejects a request with no session', async (name) => {
    signIn(null)
    expect(await outcome(run(name, anyParams))).toBe(SIGN_IN)
  })

  it.each(Object.keys(views))('%s rejects a session without a tenant', async (name) => {
    signIn('no-tenant')
    expect(await outcome(run(name, anyParams))).toBe(SIGN_IN)
  })

  const byId: [string, Record<string, string>][] = [
    ['customer', { id: 'customer-a' }],
    ['businessCustomer', { id: 'biz-a' }],
    ['businessLotCodes', { customerId: 'biz-a', saleId: 'sale-a' }],
    ['businessLotPrintSheet', { customerId: 'biz-a', saleId: 'sale-a' }],
    ['memorial', { id: 'memorial-a' }],
    ['customerCategory', { id: 'cat-a' }],
    ['user', { id: 'staff-a' }],
    ['activation', { genCode: 'STOCKA1' }],
  ]
  it.each(byId)('%s serves the owning tenant and answers 404 to another tenant', async (name, params) => {
    signIn('owner-a')
    expect(await outcome(run(name, params))).toBe('resolved')
    signIn('owner-b')
    expect(await outcome(run(name, params))).toBe(NOT_FOUND)
  })

  it('answers 404 when a by-id view is called without its id', async () => {
    signIn('owner-a')
    expect(await outcome(run('customer'))).toBe(NOT_FOUND)
    expect(await outcome(run('businessLotCodes', { customerId: 'biz-a' }))).toBe(NOT_FOUND)
  })

  it('never lets a client-supplied tenant id widen the scope', async () => {
    signIn('owner-b')
    const params = { id: 'customer-a', tenantId: 'tenant-a', customerId: 'tenant-a' }
    expect(await outcome(run('customer', params))).toBe(NOT_FOUND)
    expect(await run('customers', params)).toEqual({ customers: [], canManageAccess: true })
    expect(await run('me', params)).toMatchObject({ tenant: { id: 'tenant-b', name: 'Tenant B Ltda' } })
  })

  it('keeps the supplier module gates (403) ahead of tenant data', async () => {
    const gated: [string, Record<string, string>][] = [
      ['suppliers', {}], ['supplierNew', {}], ['supplier', { id: 'supplier-a' }],
      ['supplierCategories', {}], ['supplierCategoryNew', {}], ['supplierCategory', { id: 'supcat-a' }],
    ]
    signIn('owner-a')
    for (const [name, params] of gated) expect([name, await outcome(run(name, params))]).toEqual([name, 'resolved'])
    signIn('owner-b')
    for (const [name, params] of gated) expect([name, await outcome(run(name, params))]).toEqual([name, FORBIDDEN])
  })
})

describe('capability flags and admin-only operations', () => {
  it('reports admin capabilities from the live role, false for ordinary staff', async () => {
    signIn('owner-a')
    expect(await run('me')).toMatchObject({ isAdmin: true, canManageCustomerAccess: true, user: { id: 'owner-a', role: 'OWNER' } })
    expect(await run('customerNew')).toMatchObject({ canManageAccess: true, canUseGenCodePremium: true })
    expect(await run('businessCustomer', { id: 'biz-a' })).toMatchObject({ canDeliver: true })

    signIn('staff-a')
    expect(await run('me')).toMatchObject({ isAdmin: false, canManageCustomerAccess: false })
    expect(await run('customerNew')).toMatchObject({ canManageAccess: false, canUseGenCodePremium: false })
    expect(await run('customer', { id: 'customer-a' })).toMatchObject({ canManageAccess: false })
    expect(await run('businessCustomer', { id: 'biz-a' })).toMatchObject({ canDeliver: false })
  })

  it('withdraws customer-access capability when the operator was deactivated after sign-in', async () => {
    signIn('owner-a')
    store.user[0].isActive = false
    expect(await run('customers')).toMatchObject({ canManageAccess: false })
  })

  it('rejects staff management and customer-access actions for a non-admin role without writing', async () => {
    signIn('staff-a')
    const requestId = '05a067ee-0814-4182-9e6b-cd9f31969cc3'
    expect(await outcome(actions.createUser(input([{ firstName: 'New', lastName: 'Admin', email: 'n@example.test', role: 'OWNER', phoneCountryCode: '55', isActive: true }]), request))).toBe(FORBIDDEN)
    expect(await outcome(actions.deleteUser(input(['owner-a']), request))).toBe(FORBIDDEN)
    expect(await outcome(actions.toggleUserActive(input(['owner-a']), request))).toBe(FORBIDDEN)
    expect(await outcome(actions.grantCustomerPremium(input(['customer-a', requestId]), request))).toBe(FORBIDDEN)
    expect(await outcome(actions.sellCustomerGenCode(input(['customer-a', 'STOCKA1', requestId]), request))).toBe(FORBIDDEN)
    expect(await outcome(actions.deliverBusinessGenCode(input(['biz-a', { genCode: 'LOTA1', firstName: 'A', lastName: 'B', email: 'a@example.test' }]), request))).toBe(FORBIDDEN)
    expect(writes).toEqual([])
  })

  it('rejects a signed-out caller on a session-bound action', async () => {
    signIn(null)
    expect(await outcome(actions.toggleCustomerActive(input(['customer-a']), request))).toBe(SIGN_IN)
    expect(await outcome(actions.sendFeedback(input([{ type: 'bug', message: 'x' }]), request))).toBe(SIGN_IN)
    expect(writes).toEqual([])
  })

  it('does not let one tenant toggle another tenant\'s customer through the action bridge', async () => {
    signIn('owner-b')
    expect(await actions.toggleCustomerActive(input(['customer-a']), request)).toEqual({ ok: false, message: 'customer.notFound' })
    expect(writes).toEqual([])
  })
})

describe('view payloads', () => {
  it('never serialises a password hash', async () => {
    signIn('owner-a')
    for (const [name, params] of [['profile', {}], ['users', {}], ['user', { id: 'staff-a' }], ['me', {}],
      ['customer', { id: 'customer-a' }], ['customers', {}]] as [string, Record<string, string>][]) {
      const body = JSON.stringify(await run(name, params))
      expect([name, body.includes('hash-secret'), body.includes('"password"')]).toEqual([name, false, false])
    }
  })

  it('lists only the caller tenant\'s staff and marks the caller', async () => {
    signIn('staff-a')
    const data = await run('users') as { currentUserId: string; users: { id: string }[] }
    expect(data.currentUserId).toBe('staff-a')
    expect(data.users.map((user) => user.id)).toEqual(['owner-a', 'staff-a'])
  })

  it('builds the code detail QR target from the server APP_URL', async () => {
    signIn('owner-a')
    expect(await run('activation', { genCode: 'stock-a1' })).toMatchObject({
      genCode: 'STOCKA1', qrUrl: 'https://app.example.test/qr/STOCKA1', filename: 'qr-stocka1', status: 'AVAILABLE',
    })
  })

  it('returns the stock print batch as raw codes with QR targets, from this tenant only', async () => {
    signIn('owner-a')
    expect(await run('stockPrintBatch', { quantity: '2' })).toEqual({
      ok: true, message: '', appBaseUrl: 'https://app.example.test',
      codes: [
        { genCode: 'STOCKA1', url: 'https://app.example.test/qr/STOCKA1' },
        { genCode: 'STOCKA2', url: 'https://app.example.test/qr/STOCKA2' },
      ],
    })
    expect(await run('stockPrintBatch', { quantity: '3' })).toMatchObject({ ok: false, codes: [] })
    expect(await run('stockPrintBatch', { quantity: 'abc' })).toMatchObject({ ok: false, codes: [] })
    expect(writes).toEqual([])
  })

  it('exports only the still-available codes of a lot, with print-sheet targets', async () => {
    signIn('owner-a')
    expect(await run('businessLotCodes', { customerId: 'biz-a', saleId: 'sale-a' }))
      .toEqual({ saleId: 'sale-a', filename: 'GenCodes-sale-a.txt', codes: ['LOTA1'] })
    expect(await run('businessLotPrintSheet', { customerId: 'biz-a', saleId: 'sale-a' })).toEqual({
      saleId: 'sale-a', filename: 'QR-Codes-sale-a.html', appBaseUrl: 'https://app.example.test',
      codes: [{ genCode: 'LOTA1', url: 'https://app.example.test/qr/LOTA1' }],
    })
    expect(await outcome(run('businessLotCodes', { customerId: 'biz-a', saleId: 'sale-missing' }))).toBe(NOT_FOUND)
  })

  it('summarises a company\'s code inventory by state', async () => {
    signIn('owner-a')
    const data = await run('businessCustomer', { id: 'biz-a' }) as { codes: { genCode: string; state: string; url: string }[]; sales: unknown[] }
    expect(data.codes.map((code) => [code.genCode, code.state, code.url])).toEqual([
      ['LOTA1', 'available', 'https://app.example.test/qr/LOTA1'],
      ['LOTA2', 'activated', 'https://app.example.test/qr/LOTA2'],
    ])
    expect(data.sales).toEqual([{ id: 'sale-a', quantity: 2, unitValue: null, createdAt: soldAt, codes: ['LOTA1', 'LOTA2'], activeCodes: ['LOTA1'] }])
  })
})

describe('public verifyEmail action', () => {
  const token = 'a'.repeat(64)
  const emailToken = (overrides: Row = {}) => ({ token: hashToken(token), type: 'VERIFICATION', userId: 'staff-a',
    newEmail: null, expiresAt: new Date(Date.now() + 60_000), ...overrides })

  it('needs no session, verifies the bound user once and consumes the token', async () => {
    signIn(null)
    store.emailToken = [emailToken()]
    expect(await actions.verifyEmail(input([], { token }), request)).toEqual({ ok: true, data: { status: 'verified' } })
    expect(store.user.find((user) => user.id === 'staff-a')?.emailVerified).toBeInstanceOf(Date)
    expect(store.emailToken).toEqual([])
    expect(await actions.verifyEmail(input([], { token }), request)).toMatchObject({ ok: false })
  })

  it('applies a confirmed email change', async () => {
    signIn(null)
    store.emailToken = [emailToken({ type: 'CHANGE', newEmail: 'new@example.test' })]
    expect(await actions.verifyEmail(input([token]), request)).toEqual({ ok: true, data: { status: 'changed' } })
    expect(store.user.find((user) => user.id === 'staff-a')?.email).toBe('new@example.test')
  })

  it('rejects unknown, expired and missing tokens without touching any user', async () => {
    signIn(null)
    store.emailToken = [emailToken({ expiresAt: new Date(Date.now() - 1) })]
    expect(await actions.verifyEmail(input([], { token: 'unknown' }), request)).toMatchObject({ ok: false })
    expect(await actions.verifyEmail(input(), request)).toMatchObject({ ok: false })
    expect(await actions.verifyEmail(input([], { token }), request)).toMatchObject({ ok: false })
    expect(store.emailToken).toEqual([])
    expect(writes.filter((write) => write.model === 'user')).toEqual([])
  })
})

describe('HTTP bridge', () => {
  const context = (name: string) => ({ params: Promise.resolve({ name }) })
  const get = (name: string, bearer: boolean, query = '') =>
    createViewRoute(views, { hasBearer: async () => bearer, publicNames: publicViews })(
      new Request(`http://localhost/api/mobile/v1/views/${name}${query}`), context(name))
  const post = (name: string, bearer: boolean, body: unknown) =>
    createActionRoute(actions, { hasBearer: async () => bearer, publicNames: publicActions })(
      new Request(`http://localhost/api/mobile/v1/actions/${name}`, { method: 'POST', body: JSON.stringify(body) }), context(name))

  it('answers 401 without a bearer header even when a cookie session exists', async () => {
    signIn('owner-a')
    expect((await get('customers', false)).status).toBe(401)
    expect((await post('deleteCustomer', false, { args: ['customer-a'] })).status).toBe(401)
    expect(writes).toEqual([])
  })

  it('maps guard outcomes to 200, 401, 403 and 404', async () => {
    signIn('owner-a')
    const ok = await get('customer', true, '?id=customer-a')
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.customer).toMatchObject({ id: 'customer-a', firstName: 'Ana' })

    signIn('owner-b')
    const missing = await get('customer', true, '?id=customer-a')
    expect([missing.status, await missing.json()]).toEqual([404, { error: { code: 'notFound' } }])
    expect((await get('suppliers', true)).status).toBe(403)
    expect((await get('nope', true)).status).toBe(404)

    signIn(null)
    expect((await get('customer', true, '?id=customer-a')).status).toBe(401)
  })

  it('serves the public actions without a bearer header and nothing else', async () => {
    signIn(null)
    const response = await post('verifyEmail', false, { form: { token: 'unknown' } })
    expect([response.status, (await response.json()).result.ok]).toEqual([200, false])
    expect((await post('changePassword', false, { form: {} })).status).toBe(401)
  })
})
