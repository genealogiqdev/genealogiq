import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findUnique, verifyTenantSession } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifyTenantSession: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { appUser: { findUnique } } }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession }))

import { getCustomer } from './customers'

beforeEach(() => {
  vi.resetAllMocks()
  verifyTenantSession.mockResolvedValue({ customerId: 'tenant-local' })
  vi.stubEnv('APP_URL', 'https://app.example.test/')
})
afterEach(() => vi.unstubAllEnvs())

function customerWithProfiles() {
  return {
    id: 'customer-local',
    _count: { genCodesBought: 0, guardiansOf: 2 },
    guardiansOf: [
      { appUser: {
        id: 'living-profile', firstName: 'Ana', lastName: 'Silva',
        birthDate: null, deathDate: null, qrCode: null,
      } },
      { appUser: {
        id: 'deceased-profile', firstName: 'José', lastName: 'Silva',
        birthDate: null, deathDate: new Date('2009-08-26T00:00:00Z'),
        qrCode: { url: 'https://app.example.test/qr/EXISTING-CODE' },
      } },
    ],
  }
}

describe('customer memorial QR downloads', () => {
  it('provides living and deceased profiles with the configured fallback or their existing QR URL', async () => {
    findUnique.mockResolvedValue(customerWithProfiles())

    const customer = await getCustomer('customer-local')

    expect(customer?.guardiansOf).toEqual([
      { appUser: {
        id: 'living-profile', firstName: 'Ana', lastName: 'Silva',
        birthDate: null, deathDate: null,
        profileUrl: 'https://app.example.test/profile/living-profile',
      } },
      { appUser: {
        id: 'deceased-profile', firstName: 'José', lastName: 'Silva',
        birthDate: null, deathDate: new Date('2009-08-26T00:00:00Z'),
        profileUrl: 'https://app.example.test/qr/EXISTING-CODE',
      } },
    ])
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-local', tenantId: 'tenant-local' },
      select: expect.objectContaining({
        _count: { select: { genCodesBought: true, guardiansOf: { where: { status: 'ACCEPTED' } } } },
        guardiansOf: {
          where: { status: 'ACCEPTED' },
          select: { appUser: { select: {
            id: true, firstName: true, lastName: true,
            birthDate: true, deathDate: true, qrCode: { select: { url: true } },
          } } },
        },
      }),
    }))
  })

  it('uses the default APP origin when none is configured', async () => {
    vi.stubEnv('APP_URL', undefined)
    findUnique.mockResolvedValue(customerWithProfiles())

    const customer = await getCustomer('customer-local')

    expect(customer?.guardiansOf[0].appUser.profileUrl).toBe('https://genealogiq.app/profile/living-profile')
  })

  it('returns no QR data for a missing customer or one outside the session tenant', async () => {
    findUnique.mockResolvedValue(null)

    expect(await getCustomer('customer-elsewhere')).toBeNull()
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-elsewhere', tenantId: 'tenant-local' },
    }))
  })

  it('requires the tenant session before reading any customer', async () => {
    verifyTenantSession.mockRejectedValue(new Error('Unauthorized'))

    await expect(getCustomer('customer-local')).rejects.toThrow('Unauthorized')
    expect(findUnique).not.toHaveBeenCalled()
  })
})
