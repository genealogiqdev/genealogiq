import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCustomer } = vi.hoisted(() => ({ getCustomer: vi.fn() }))
vi.mock('@/queries/customers', () => ({ getCustomer }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
import { getCustomerMemorialQr } from './memorial-qr.actions'

beforeEach(() => vi.resetAllMocks())

const customer = (qrAccess = 'allowed') => ({ guardiansOf: [{ appUser: {
  id: 'memorial', qrAccess, profileUrl: 'https://genealogiq.app/qr/EXISTING-CODE',
} }] })

describe('customer memorial QR authorization', () => {
  it('returns the stored destination only after resolving the scoped customer', async () => {
    getCustomer.mockResolvedValue(customer())
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({
      ok: true, data: { profileUrl: 'https://genealogiq.app/qr/EXISTING-CODE' },
    })
    expect(getCustomer).toHaveBeenCalledWith('customer')
  })

  it.each(['premiumRequired', 'limitReached'])('denies a direct request for %s', async (reason) => {
    getCustomer.mockResolvedValue(customer(reason))
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: false, message: `qrCode.${reason}` })
  })

  it('rechecks entitlement when the plan expires between preview and export', async () => {
    getCustomer.mockResolvedValueOnce(customer()).mockResolvedValueOnce(customer('premiumRequired'))
    expect((await getCustomerMemorialQr('customer', 'memorial')).ok).toBe(true)
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: false, message: 'qrCode.premiumRequired' })
    expect(getCustomer).toHaveBeenCalledTimes(2)
  })

  it('rejects another tenant, a missing customer and a non-accepted profile', async () => {
    getCustomer.mockResolvedValue(null)
    expect(await getCustomerMemorialQr('foreign-customer', 'memorial')).toEqual({ ok: false, message: 'qrCode.notFound' })
    getCustomer.mockResolvedValue(customer())
    expect(await getCustomerMemorialQr('customer', 'pending-profile')).toEqual({ ok: false, message: 'qrCode.notFound' })
  })

  it('propagates the session wall instead of returning a profile destination', async () => {
    getCustomer.mockRejectedValue(new Error('Unauthorized'))
    await expect(getCustomerMemorialQr('customer', 'memorial')).rejects.toThrow('Unauthorized')
  })

  it.each([['', 'memorial'], ['customer', '  '], ['customer', 42]])('validates IDs before reading the database', async (customerId, profileId) => {
    expect(await getCustomerMemorialQr(customerId as string, profileId as string)).toEqual({ ok: false, message: 'common.invalidData' })
    expect(getCustomer).not.toHaveBeenCalled()
  })
})
