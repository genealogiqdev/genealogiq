import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findUnique, findSubscription, verifyTenantSession } = vi.hoisted(() => ({
  findUnique: vi.fn(), findSubscription: vi.fn(), verifyTenantSession: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  appUser: { findUnique }, subscription: { findUnique: findSubscription },
} }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession }))
import { getCustomer } from './customers'

const premium = { name: 'Premium', code: 'PREMIUM', memorialsMax: 5, petsMax: 5, qrCodeMax: 1 }
const free = { name: 'Free', code: 'FREE', memorialsMax: 1, petsMax: 0, qrCodeMax: 1 }
const now = new Date('2026-10-09T12:00:00Z')

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  verifyTenantSession.mockResolvedValue({ customerId: 'tenant-local' })
  findSubscription.mockResolvedValue(free)
  vi.stubEnv('APP_URL', 'https://app.example.test/')
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

function profile(id: string, role = 'APP_MEMO', deathDate: Date | null = null) {
  return { id, role, firstName: 'Ana', lastName: 'Silva', birthDate: null, deathDate,
    createdAt: new Date('2026-01-01'), qrCode: null as { url: string } | null, genCode: null as { id: string } | null }
}
function customerWithProfiles() {
  return {
    id: 'customer-local',
    _count: { genCodesBought: 0 },
    guardiansOf: [
      { appUser: profile('living-profile') },
      { appUser: { ...profile('deceased-profile', 'APP_MEMO', new Date('2009-08-26T00:00:00Z')),
        qrCode: { url: 'https://app.example.test/qr/EXISTING-CODE' } } },
      { appUser: profile('pet-profile', 'APP_PET') },
    ],
    appSales: [{ subscription: premium }],
    extraUnitPurchases: [] as { resource: string; quantity: number }[],
  }
}

describe('customer memorial quotas and QR downloads', () => {
  it('uses plan capacity for two humans and one pet even with zero GenCode purchases', async () => {
    findUnique.mockResolvedValue(customerWithProfiles())
    const customer = await getCustomer('customer-local')

    expect(customer?.memorialQuota).toEqual({
      planName: 'Premium', planCode: 'PREMIUM',
      humans: { count: 2, limit: 5, available: 3 }, pets: { count: 1, limit: 5, available: 4 },
    })
    expect(customer?.guardiansOf.map(({ appUser }) => [appUser.id, appUser.qrAccess, appUser.profileUrl])).toEqual([
      ['living-profile', 'allowed', 'https://app.example.test/profile/living-profile'],
      ['deceased-profile', 'allowed', 'https://app.example.test/qr/EXISTING-CODE'],
      ['pet-profile', 'allowed', 'https://app.example.test/profile/pet-profile'],
    ])
    expect(customer).not.toHaveProperty('appSales')
    expect(customer).not.toHaveProperty('extraUnitPurchases')
    expect(findSubscription).not.toHaveBeenCalled()
  })

  it('scopes customers, profile roles, accepted guardianships, sales and purchases on the server', async () => {
    findUnique.mockResolvedValue(customerWithProfiles())
    await getCustomer('customer-local')

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-local', tenantId: 'tenant-local', role: 'APP_USER' },
      select: expect.objectContaining({
        _count: { select: { genCodesBought: { where: { tenantId: 'tenant-local' } } } },
        guardiansOf: expect.objectContaining({
          where: { status: 'ACCEPTED', appUser: { role: { in: ['APP_MEMO', 'APP_PET'] } } },
        }),
        appSales: {
          where: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
          orderBy: { currentPeriodEnd: 'desc' }, take: 1,
          select: { subscription: { select: { name: true, code: true, memorialsMax: true, petsMax: true, qrCodeMax: true } } },
        },
      }),
    }))
  })

  it('uses the Free fallback after expiry and never treats bought GenCodes as new memorial slots', async () => {
    const fixture = customerWithProfiles()
    fixture.appSales = []
    fixture.guardiansOf = [{ appUser: profile('free-memorial') }]
    fixture._count.genCodesBought = 20
    findUnique.mockResolvedValue(fixture)

    const customer = await getCustomer('customer-local')
    expect(customer?.memorialQuota).toEqual({
      planName: 'Free', planCode: 'FREE',
      humans: { count: 1, limit: 1, available: 0 }, pets: { count: 0, limit: 0, available: 0 },
    })
    expect(customer?.guardiansOf[0].appUser.qrAccess).toBe('premiumRequired')
    expect(findSubscription).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'FREE' } }))
  })

  it('keeps over-limit records visible while denying only the sixth QR of each type', async () => {
    const fixture = customerWithProfiles()
    fixture.guardiansOf = [1, 2, 3, 4, 5, 6].flatMap((index) => [
      { appUser: profile('human-' + index) }, { appUser: profile('pet-' + index, 'APP_PET') },
    ])
    findUnique.mockResolvedValue(fixture)
    const customer = await getCustomer('customer-local')

    expect(customer?.memorialQuota.humans).toEqual({ count: 6, limit: 5, available: 0 })
    expect(customer?.memorialQuota.pets).toEqual({ count: 6, limit: 5, available: 0 })
    expect(customer?.guardiansOf).toHaveLength(12)
    expect(customer?.guardiansOf.filter(({ appUser }) => appUser.qrAccess === 'limitReached').map(({ appUser }) => appUser.id)).toEqual(['human-6', 'pet-6'])
  })

  it('adds purchased memorial capacity independently of purchased QR units', async () => {
    const fixture = customerWithProfiles()
    fixture.extraUnitPurchases = [{ resource: 'MEMORIAL', quantity: 2 }, { resource: 'QR_CODE', quantity: 3 }]
    findUnique.mockResolvedValue(fixture)
    const customer = await getCustomer('customer-local')
    expect(customer?.memorialQuota.humans).toEqual({ count: 2, limit: 7, available: 5 })
    expect(customer?.memorialQuota.pets).toEqual({ count: 1, limit: 5, available: 4 })
  })

  it('preserves an activated plaque for a Free customer without unlocking other memorials', async () => {
    const fixture = customerWithProfiles()
    fixture.appSales = []
    fixture.guardiansOf[1].appUser.genCode = { id: 'activated-code' }
    findUnique.mockResolvedValue(fixture)
    const customer = await getCustomer('customer-local')
    expect(customer?.guardiansOf.map(({ appUser }) => appUser.qrAccess)).toEqual(['premiumRequired', 'allowed', 'premiumRequired'])
  })

  it('uses the default APP origin when none is configured', async () => {
    vi.stubEnv('APP_URL', undefined)
    findUnique.mockResolvedValue(customerWithProfiles())
    expect((await getCustomer('customer-local'))?.guardiansOf[0].appUser.profileUrl).toBe('https://genealogiq.app/profile/living-profile')
  })

  it('returns no profile or plan data for a missing or other-tenant customer', async () => {
    findUnique.mockResolvedValue(null)
    expect(await getCustomer('customer-elsewhere')).toBeNull()
    expect(findSubscription).not.toHaveBeenCalled()
  })

  it('requires the tenant session before reading any customer', async () => {
    verifyTenantSession.mockRejectedValue(new Error('Unauthorized'))
    await expect(getCustomer('customer-local')).rejects.toThrow('Unauthorized')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('reports a missing Free configuration instead of inventing entitlements', async () => {
    findUnique.mockResolvedValue({ ...customerWithProfiles(), appSales: [] })
    findSubscription.mockResolvedValue(null)
    await expect(getCustomer('customer-local')).rejects.toThrow('FREE subscription row not found')
  })
})
