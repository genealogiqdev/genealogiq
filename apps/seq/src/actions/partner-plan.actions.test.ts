import { beforeEach, describe, expect, it, vi } from 'vitest'
const { verifyTenantSession, openPartnerCheckout } = vi.hoisted(() => ({ verifyTenantSession: vi.fn(), openPartnerCheckout: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))
vi.mock('@genealogiq/services/partner-checkout', () => ({ openPartnerCheckout, CHECKOUT_ORIGINS: { seq: 'SEQ' }, PartnerCheckoutError: class extends Error {} }))
import { subscribeToPartnerPlan } from './partner-plan.actions'
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('SEQUOIA_URL', 'http://localhost:3002'); verifyTenantSession.mockResolvedValue({ customerId: 'tenant-1', user: { id: 'staff-1', role: 'USER' } }) })
describe('tenant purchasing contract', () => {
  it('rejects an invalid cadence before creating checkout', async () => {
    expect(await subscribeToPartnerPlan('plan-1', 'weekly' as never)).toEqual({ ok: false, message: 'common.invalidData' })
    expect(openPartnerCheckout).not.toHaveBeenCalled()
  })
  it('takes tenant and currency from server session and locale', async () => {
    openPartnerCheckout.mockResolvedValue({ url: 'https://checkout.example.test/fixture' })
    expect(await subscribeToPartnerPlan('plan-1', 'cash')).toEqual({ ok: true, data: { url: 'https://checkout.example.test/fixture' } })
    expect(openPartnerCheckout).toHaveBeenCalledWith({ tenantId: 'tenant-1', planId: 'plan-1', cadence: 'cash', currency: 'brl', origin: 'SEQ', successUrl: 'http://localhost:3002/purchasing/plans?status=success', cancelUrl: 'http://localhost:3002/purchasing/plans?status=cancel' })
  })
  it('does not create checkout when tenant session validation rejects', async () => {
    verifyTenantSession.mockRejectedValue(new Error('session required'))
    await expect(subscribeToPartnerPlan('plan-1', 'cash')).rejects.toThrow('session required')
    expect(openPartnerCheckout).not.toHaveBeenCalled()
  })
})
