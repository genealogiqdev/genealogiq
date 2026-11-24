import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The guards are REAL here (@/lib/dal, @/lib/consumer-access): only the session
 * source (`@/auth`), the database and the queries/actions behind the guards are
 * replaced. A view that forgets its guard therefore reaches a query mock, and
 * the test sees it.
 */

const h = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { vi: mock } = await import('vitest')

  const actionsDir = fileURLToPath(new URL('../actions/', import.meta.url))
  const actionFiles = fs.readdirSync(actionsDir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  const exportedBy = new Map<string, string[]>()
  for (const file of actionFiles) {
    const source = fs.readFileSync(`${actionsDir}${file}`, 'utf8')
    exportedBy.set(file, [...source.matchAll(/^export async function (\w+)/gm)].map((match) => match[1]))
  }

  const actionMocks: Record<string, ReturnType<typeof mock.fn>> = {}
  const mockActionFile = (file: string) => {
    const names = exportedBy.get(file)
    if (!names) throw new Error(`unknown action file ${file}`)
    return Object.fromEntries(names.map((name) => [name, (actionMocks[name] ??= mock.fn())]))
  }

  const queryMocks: Record<string, ReturnType<typeof mock.fn>> = {}
  const mockQueries = (...names: string[]) =>
    Object.fromEntries(names.map((name) => [name, (queryMocks[name] ??= mock.fn())]))

  return {
    actionFiles,
    exportedActionNames: [...exportedBy.values()].flat(),
    actionMocks,
    mockActionFile,
    queryMocks,
    mockQueries,
    auth: mock.fn(),
    findUser: mock.fn(),
    checkRateLimit: mock.fn(),
    consumeEmailToken: mock.fn(),
  }
})

const digestError = (digest: string) => Object.assign(new Error(digest), { digest })

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw digestError(`NEXT_REDIRECT;replace;${url};307;`) },
  forbidden: () => { throw digestError('NEXT_HTTP_ERROR_FALLBACK;403') },
  notFound: () => { throw digestError('NEXT_HTTP_ERROR_FALLBACK;404') },
}))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => 'pt-BR'),
}))
vi.mock('@/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.findUser } } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: h.checkRateLimit, getClientIp: vi.fn(async () => '203.0.113.9') }))
vi.mock('@/lib/verify-email', () => ({ consumeEmailToken: h.consumeEmailToken }))

vi.mock('@/queries/company', () => h.mockQueries('getCompany'))
vi.mock('@/queries/consumers', () => h.mockQueries('getConsumers', 'getConsumerPartners', 'getConsumerForRegistration'))
vi.mock('@/queries/customers', () => h.mockQueries('getCustomers', 'getCustomer', 'getActiveCustomers', 'getCustomerAccess'))
vi.mock('@/queries/dashboard', () => h.mockQueries('getDashboardStats'))
vi.mock('@/queries/discount-coupons', () =>
  h.mockQueries('getDiscountCoupons', 'getDiscountCoupon', 'getActiveProductsForSelect', 'getSelectableCoupons'))
vi.mock('@/queries/extra-unit-prices', () => h.mockQueries('getExtraUnitPrices'))
vi.mock('@/queries/gencode-packages', () => h.mockQueries('getGenCodePackages', 'getGenCodeOrders', 'getGenCodeCustomers'))
vi.mock('@/queries/manual-coupons', () => h.mockQueries('getManualCouponOptions', 'getManualCouponHistory'))
vi.mock('@/queries/partner-gencodes', () => h.mockQueries('getPartnerGenCodeOverview'))
vi.mock('@/queries/partner-plans', () => h.mockQueries('getPartnerPlans', 'getPartnerPlan', 'getSellablePartnerPlans'))
vi.mock('@/queries/partner-subscriptions', () => h.mockQueries('getPartnerSubscriptions', 'getPartnerSubscription'))
vi.mock('@/queries/reports', () => ({
  ...h.mockQueries('getGenCodeFunnel', 'getResellerBreakdown', 'getChannelBreakdown', 'getRevenueByPlan',
    'getSellThrough', 'getTrialConversion'),
  STALE_AFTER_DAYS: 30,
}))
vi.mock('@/queries/subscriptions', () => h.mockQueries('getSubscriptions', 'getSubscription'))
vi.mock('@/queries/users', () => h.mockQueries('getUsers', 'getUser'))

vi.mock('@/actions/auth', () => h.mockActionFile('auth.ts'))
vi.mock('@/actions/company.actions', () => h.mockActionFile('company.actions.ts'))
vi.mock('@/actions/consumer-partner.actions', () => h.mockActionFile('consumer-partner.actions.ts'))
vi.mock('@/actions/consumer.actions', () => h.mockActionFile('consumer.actions.ts'))
vi.mock('@/actions/customer.actions', () => h.mockActionFile('customer.actions.ts'))
vi.mock('@/actions/discount-coupon.actions', () => h.mockActionFile('discount-coupon.actions.ts'))
vi.mock('@/actions/extra-unit-price.actions', () => h.mockActionFile('extra-unit-price.actions.ts'))
vi.mock('@/actions/feedback.actions', () => h.mockActionFile('feedback.actions.ts'))
vi.mock('@/actions/gencode-package.actions', () => h.mockActionFile('gencode-package.actions.ts'))
vi.mock('@/actions/manual-coupon.actions', () => h.mockActionFile('manual-coupon.actions.ts'))
vi.mock('@/actions/partner-consumer.actions', () => h.mockActionFile('partner-consumer.actions.ts'))
vi.mock('@/actions/partner-plan.actions', () => h.mockActionFile('partner-plan.actions.ts'))
vi.mock('@/actions/profile.actions', () => h.mockActionFile('profile.actions.ts'))
vi.mock('@/actions/subscription.actions', () => h.mockActionFile('subscription.actions.ts'))
vi.mock('@/actions/user.actions', () => h.mockActionFile('user.actions.ts'))

import { views, publicViews } from './views'
import { actions, publicActions } from './actions'

const request = new Request('http://localhost:3001/api/mobile/v1/x')
const view = (name: string, params: Record<string, string> = {}) => views[name](params, request)
const act = (name: string, input: { args?: unknown[]; form?: Record<string, string> } = {}) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(input.form ?? {})) data.append(key, value)
  return actions[name]({ args: input.args ?? [], form: data }, request)
}

const UNAUTHORIZED = { digest: 'NEXT_REDIRECT;replace;/sign-in;307;' }
const FORBIDDEN = { digest: 'NEXT_HTTP_ERROR_FALLBACK;403' }
const NOT_FOUND = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

function signIn(role: string | null) {
  h.auth.mockResolvedValue(role === null ? null : {
    user: { id: 'staff-1', name: 'Ana Souza', email: 'ana@example.com', image: null, role },
  })
}
/** The row verifyConsumerAdmin reloads. */
function liveOperator(row: { role: string; isActive: boolean; tenantId: string | null } | null) {
  h.findUser.mockResolvedValue(row)
}
const queriesCalled = () => Object.values(h.queryMocks).reduce((sum, fn) => sum + fn.mock.calls.length, 0)

beforeEach(() => {
  vi.resetAllMocks()
  signIn('ADMIN')
  liveOperator({ role: 'ADMIN', isActive: true, tenantId: null })
  h.checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 })
  h.queryMocks.getGenCodePackages.mockResolvedValue([{ id: 'pkg-1' }])
  h.queryMocks.getActiveCustomers.mockResolvedValue([])
  h.queryMocks.getConsumers.mockResolvedValue({ total: 0, consumers: [], status: 'all', tenantId: '', page: 1, pages: 1 })
})

const ADMIN_ONLY_VIEWS = ['gencodesNew', 'contractNew', 'discountCouponRedeem']
const CONSUMER_ADMIN_VIEWS = ['consumers', 'consumerNew', 'partnerGencodes']

describe('registry surface', () => {
  it('exposes no public view', () => {
    expect(publicViews).toEqual([])
  })

  it('exposes only the signed-out account steps as public actions', () => {
    expect([...publicActions].sort()).toEqual(['forgotPassword', 'resetPassword', 'verifyEmail'])
    for (const name of publicActions) expect(actions).toHaveProperty(name)
  })

  it('registers one view per authenticated screen', () => {
    expect(Object.keys(views).sort()).toEqual([
      'company', 'consumerNew', 'consumers', 'contract', 'contractNew', 'contracts', 'customer', 'customerNew',
      'customers', 'dashboard', 'discountCoupon', 'discountCouponNew', 'discountCouponRedeem', 'discountCoupons',
      'extraUnitPrices', 'gencodes', 'gencodesNew', 'me', 'partnerGencodes', 'plan', 'planNew', 'plans', 'profile',
      'reports', 'subscription', 'subscriptionNew', 'subscriptions', 'user', 'userNew', 'users',
    ])
  })

  it('registers every exported server action except login, logout and setupSystem', () => {
    expect(h.actionFiles).toHaveLength(15)
    expect(h.exportedActionNames).toEqual(expect.arrayContaining(['login', 'logout', 'setupSystem', 'createCustomer']))
    const expected = h.exportedActionNames.filter((name) => !['login', 'logout', 'setupSystem'].includes(name))
    expect(Object.keys(actions).sort()).toEqual([...expected, 'verifyEmail'].sort())
  })
})

describe('view guards', () => {
  it.each(Object.keys(views))('%s rejects a request with no session before reading anything', async (name) => {
    signIn(null)
    await expect(view(name, { id: 'x' })).rejects.toMatchObject(UNAUTHORIZED)
    expect(queriesCalled()).toBe(0)
    expect(h.findUser).not.toHaveBeenCalled()
  })

  it.each(ADMIN_ONLY_VIEWS)('%s rejects a COMERCIAL role before reading anything', async (name) => {
    signIn('COMERCIAL')
    await expect(view(name)).rejects.toMatchObject(FORBIDDEN)
    expect(queriesCalled()).toBe(0)
  })

  it.each(ADMIN_ONLY_VIEWS)('%s serves an ADMIN', async (name) => {
    await expect(view(name)).resolves.toBeTypeOf('object')
  })

  it.each(CONSUMER_ADMIN_VIEWS)('%s rejects a COMERCIAL role', async (name) => {
    signIn('COMERCIAL')
    await expect(view(name)).rejects.toMatchObject(FORBIDDEN)
    expect(queriesCalled()).toBe(0)
  })

  it.each(CONSUMER_ADMIN_VIEWS.flatMap((name) => [
    [name, 'deactivated', { role: 'ADMIN', isActive: false, tenantId: null }],
    [name, 'demoted', { role: 'USER', isActive: true, tenantId: null }],
    [name, 'tenant-owned', { role: 'OWNER', isActive: true, tenantId: 'funeral-home' }],
    [name, 'deleted', null],
  ] as const))('%s rejects an admin session whose live row is %s', async (name, _label, row) => {
    liveOperator(row)
    await expect(view(name)).rejects.toMatchObject(FORBIDDEN)
    expect(queriesCalled()).toBe(0)
  })

  it('lets general staff read a staff screen', async () => {
    signIn('COMERCIAL')
    h.queryMocks.getDashboardStats.mockResolvedValue({ monthlyCount: 3 })
    await expect(view('dashboard')).resolves.toEqual({ monthlyCount: 3 })
  })
})

describe('me', () => {
  it('reports an administrator with live consumer-directory scope', async () => {
    await expect(view('me')).resolves.toEqual({
      user: { id: 'staff-1', name: 'Ana Souza', email: 'ana@example.com', image: null },
      role: 'ADMIN', isAdmin: true, isConsumerAdmin: true,
    })
  })

  it('reports isConsumerAdmin false, without throwing, when the live check fails', async () => {
    liveOperator({ role: 'ADMIN', isActive: false, tenantId: null })
    await expect(view('me')).resolves.toMatchObject({ isAdmin: true, isConsumerAdmin: false })
  })

  it('reports neither privilege for a COMERCIAL role', async () => {
    signIn('COMERCIAL')
    await expect(view('me')).resolves.toMatchObject({ role: 'COMERCIAL', isAdmin: false, isConsumerAdmin: false })
  })
})

describe('view payloads', () => {
  it('reads the profile through an explicit select that leaves credentials out', async () => {
    h.findUser.mockResolvedValue({
      firstName: 'Ana', lastName: 'Souza', email: 'ana@example.com', avatarUrl: null, nationalId: null,
      birthDate: new Date('1990-05-17T00:00:00.000Z'), phoneCountryCode: '55', phone: null, address: null,
    })
    const data = await view('profile') as { values: { birthDate: string } }
    const query = h.findUser.mock.calls[0][0]
    expect(query.where).toEqual({ id: 'staff-1' })
    expect(query.include).toBeUndefined()
    expect(Object.keys(query.select)).not.toEqual(expect.arrayContaining(['password']))
    expect(query.select).not.toHaveProperty('failedLoginAttempts')
    expect(query.select).not.toHaveProperty('googleId')
    expect(data.values.birthDate).toBe('1990-05-17')
  })

  it('answers 404 for an unknown partner and never asks for its access card', async () => {
    h.queryMocks.getCustomer.mockResolvedValue(null)
    await expect(view('customer', { id: 'missing' })).rejects.toMatchObject(NOT_FOUND)
    expect(h.queryMocks.getCustomerAccess).not.toHaveBeenCalled()
  })

  it('passes a non-privileged partner read through with the access card withheld', async () => {
    signIn('COMERCIAL')
    h.queryMocks.getCustomer.mockResolvedValue({ id: 't1', taxId: '•••', address: null })
    h.queryMocks.getCustomerAccess.mockResolvedValue(null)
    await expect(view('customer', { id: 't1' })).resolves.toEqual({
      customer: { id: 't1', taxId: '•••', address: null }, access: null, canEdit: false,
    })
  })

  it('forwards the directory filters and derives each row\'s capabilities', async () => {
    const future = new Date(Date.now() + 86_400_000)
    const base = {
      firstName: 'Lia', lastName: 'Reis', isActive: true, createdAt: new Date('2026-01-02T00:00:00.000Z'),
      _count: { genCodesBought: 2 }, appSales: [], consumerAccessGrants: [],
    }
    const liveGrant = (tenantId: string | null) => ({
      id: 'grant-1', expiresAt: future, emailSentAt: null, revokedAt: null,
      appSale: { status: 'active', currentPeriodEnd: future, tenantId },
    })
    h.queryMocks.getConsumers.mockResolvedValue({
      total: 4, status: 'active', tenantId: 't1', page: 2, pages: 3,
      consumers: [
        { ...base, id: 'gifted', email: 'a@example.com', tenantId: null, tenant: null,
          appSales: [{ currentPeriodEnd: future, subscription: { name: 'Premium' } }],
          consumerAccessGrants: [liveGrant(null)] },
        { ...base, id: 'partner', email: 'b@example.com', tenantId: 't1', tenant: { id: 't1', name: 'Casa', tradeName: null },
          consumerAccessGrants: [liveGrant('t1')] },
        { ...base, id: 'free', email: 'c@example.com', tenantId: null, tenant: null },
        { ...base, id: 'inactive', email: null, isActive: false, tenantId: null, tenant: null },
      ],
    })
    h.queryMocks.getConsumerPartners.mockResolvedValue([{ id: 't1', name: 'Casa', tradeName: null }])

    const data = await view('consumers', { q: 'lia', page: '2', status: 'active', tenant: 't1' }) as {
      pageSize: number; consumers: { id: string; access: unknown; gift: unknown; genCodesSold: number; capabilities: unknown }[]
    }

    expect(h.queryMocks.getConsumers).toHaveBeenCalledWith('lia', 2, 'active', 't1')
    expect(data).toMatchObject({ total: 4, page: 2, pages: 3, pageSize: 25, status: 'active', tenantId: 't1' })
    const row = (id: string) => data.consumers.find((consumer) => consumer.id === id)!
    expect(row('gifted').access).toEqual({ planName: 'Premium', until: future })
    expect(row('gifted').gift).toMatchObject({ id: 'grant-1', revokedAt: null })
    expect(row('gifted').genCodesSold).toBe(2)
    expect(row('gifted').capabilities).toEqual({
      linkPartner: true, resendAccess: true, revokeDirectGrantId: 'grant-1', partnerPremium: null, grantDirect: false,
    })
    expect(row('partner').gift).toBeNull()
    expect(row('partner').capabilities).toEqual({
      linkPartner: false, resendAccess: false, revokeDirectGrantId: null,
      partnerPremium: { canGrant: true, revokeGrantId: 'grant-1' }, grantDirect: false,
    })
    expect(row('free').capabilities).toEqual({
      linkPartner: true, resendAccess: false, revokeDirectGrantId: null, partnerPremium: null, grantDirect: true,
    })
    expect(row('inactive').capabilities).toEqual({
      linkPartner: true, resendAccess: false, revokeDirectGrantId: null, partnerPremium: null, grantDirect: false,
    })
  })

  it('answers 404 when a registration prefill is not an eligible independent customer', async () => {
    h.queryMocks.getConsumerForRegistration.mockResolvedValue(null)
    await expect(view('consumerNew', { id: 'partner-owned' })).rejects.toMatchObject(NOT_FOUND)
  })

  it('prices the new-contract prerequisites in the operator language\'s currency', async () => {
    h.queryMocks.getActiveCustomers.mockResolvedValue([{ id: 't1', entityType: 'COMPANY', name: 'Casa', taxId: '123' }])
    const data = await view('contractNew')
    expect(h.queryMocks.getSellablePartnerPlans).toHaveBeenCalledWith('brl', true)
    expect(h.queryMocks.getSelectableCoupons).toHaveBeenCalledWith('brl')
    expect(data).toMatchObject({ currency: 'brl', tenants: [{ id: 't1', name: 'Casa', taxId: '123' }] })
  })

  it('shows a contract\'s cycles without the frozen snapshot or provider identifiers', async () => {
    h.queryMocks.getPartnerSubscription.mockResolvedValue({
      id: 'c1', status: 'ACTIVE', autoRenew: true, createdAt: new Date('2026-02-01T00:00:00.000Z'),
      founderRolloverEligible: false, founderRolloverUsed: false,
      stripeSubscriptionId: 'sub_secret', stripeCustomerId: 'cus_secret',
      tenant: { id: 't1', name: 'Casa', email: 'casa@example.com' },
      plan: { id: 'p1', name: 'Pro', code: 'PRO', annualAllowance: 100 },
      cycles: [{
        id: 'cy2', startAt: new Date('2027-02-01T00:00:00.000Z'), endAt: new Date('2028-02-01T00:00:00.000Z'),
        graceEndAt: new Date('2028-03-02T00:00:00.000Z'), status: 'ACTIVE', renewedFromCycleId: 'cy1',
        stripeInvoiceId: 'in_secret', priceSnapshot: { amountPaid: 123450, currency: 'BRL', cadence: 'cash', internal: 'x' },
      }, {
        id: 'cy1', startAt: new Date('2026-02-01T00:00:00.000Z'), endAt: new Date('2027-02-01T00:00:00.000Z'),
        graceEndAt: new Date('2027-03-03T00:00:00.000Z'), status: 'CLOSED', renewedFromCycleId: null,
        stripeInvoiceId: null, priceSnapshot: null,
      }],
    })
    const data = await view('contract', { id: 'c1' }) as { cycles: unknown[] }
    expect(JSON.stringify(data)).not.toMatch(/secret|priceSnapshot|internal/)
    expect(data.cycles).toEqual([
      expect.objectContaining({ id: 'cy2', isRenewal: true, amountPaid: 123450, currency: 'BRL', cadence: 'cash' }),
      expect.objectContaining({ id: 'cy1', isRenewal: false, amountPaid: null, currency: null, cadence: null }),
    ])
  })
})

describe('action bridge', () => {
  it('passes positional arguments in the action\'s own order', async () => {
    h.actionMocks.sendPartnerPlanLink.mockResolvedValue({ ok: true, data: { email: 'casa@example.com' } })
    const result = await act('sendPartnerPlanLink', { args: ['tenant-1', 'plan-1', 'installment', null] })
    expect(h.actionMocks.sendPartnerPlanLink).toHaveBeenCalledWith('tenant-1', 'plan-1', 'installment', null)
    expect(result).toEqual({ ok: true, data: { email: 'casa@example.com' } })
  })

  it('refuses a non-string identifier before the action runs', async () => {
    const result = await act('deleteCustomer', { args: [{ not: '' }] })
    expect(result).toEqual({ ok: false, message: 'common.invalidData' })
    expect(h.actionMocks.deleteCustomer).not.toHaveBeenCalled()
  })

  it('refuses a missing or array payload for a data action', async () => {
    expect(await act('updateCustomer', { args: ['tenant-1'] })).toEqual({ ok: false, message: 'common.invalidData' })
    expect(await act('createUser', { args: [['x']] })).toEqual({ ok: false, message: 'common.invalidData' })
    expect(h.actionMocks.updateCustomer).not.toHaveBeenCalled()
    expect(h.actionMocks.createUser).not.toHaveBeenCalled()
  })

  it('drops arguments beyond the action\'s signature', async () => {
    await act('toggleUserActive', { args: ['user-9', 'extra', { more: true }] })
    expect(h.actionMocks.toggleUserActive).toHaveBeenCalledWith('user-9')
  })

  it('hands form actions an empty previous state and the posted fields', async () => {
    await act('changePassword', { form: { currentPassword: 'old-secret', newPassword: 'New-secret-1' } })
    const [previous, data] = h.actionMocks.changePassword.mock.calls[0] as [unknown, FormData]
    expect(previous).toBeUndefined()
    expect(data.get('currentPassword')).toBe('old-secret')
    expect(data.get('newPassword')).toBe('New-secret-1')
  })

  it('turns a coupon\'s ISO redeemBy into the Date its schema validates', async () => {
    await act('createDiscountCoupon', { args: [{ code: 'WELCOME', redeemBy: '2027-01-31T00:00:00.000Z' }] })
    const [payload] = h.actionMocks.createDiscountCoupon.mock.calls[0] as [{ code: string; redeemBy: Date }]
    expect(payload.code).toBe('WELCOME')
    expect(payload.redeemBy).toBeInstanceOf(Date)
    expect(payload.redeemBy.toISOString()).toBe('2027-01-31T00:00:00.000Z')

    await act('createDiscountCoupon', { args: [{ code: 'OPEN', redeemBy: null }] })
    expect(h.actionMocks.createDiscountCoupon).toHaveBeenLastCalledWith({ code: 'OPEN', redeemBy: null })
  })
})

describe('verifyEmail', () => {
  it.each([
    ['verified', { ok: true, data: { status: 'verified' }, message: undefined }],
    ['changed', { ok: true, data: { status: 'changed' }, message: undefined }],
    ['invalid', { ok: false, message: 'verify.invalidDescription' }],
  ])('reports a %s token', async (outcome, expected) => {
    h.consumeEmailToken.mockResolvedValue(outcome)
    expect(await act('verifyEmail', { form: { token: 'abc123' } })).toEqual(expected)
    expect(h.consumeEmailToken).toHaveBeenCalledWith('abc123')
  })

  it('refuses a request without a token', async () => {
    expect(await act('verifyEmail')).toEqual({ ok: false, message: 'common.invalidData' })
    expect(h.consumeEmailToken).not.toHaveBeenCalled()
  })

  it('stops consuming tokens once the address is rate limited', async () => {
    h.checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 })
    expect(await act('verifyEmail', { form: { token: 'abc123' } })).toEqual({ ok: false, message: 'auth.tooManyAttempts' })
    expect(h.checkRateLimit).toHaveBeenCalledWith({ key: 'verify-email:ip:203.0.113.9', maxAttempts: 10, windowSeconds: 3600 })
    expect(h.consumeEmailToken).not.toHaveBeenCalled()
  })
})
