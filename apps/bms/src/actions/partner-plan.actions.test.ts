import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { verify, tenant, coupon, checkout, mail } = vi.hoisted(() => ({
  verify: vi.fn(), tenant: vi.fn(), coupon: vi.fn(), checkout: vi.fn(), mail: vi.fn(),
}))
vi.mock('@/lib/dal', () => ({ verifyAdmin: verify }))
vi.mock('@/lib/prisma', () => ({ prisma: { tenant: { findUnique: tenant }, discountCoupon: { findFirst: coupon } } }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/email', () => ({ sendSalePaymentLinkEmail: mail }))
vi.mock('@/lib/billing', () => ({ BMS_ORIGIN: 'bms' }))
vi.mock('@genealogiq/services/plan-sync', () => ({ syncPartnerPlan: vi.fn() }))
vi.mock('@genealogiq/services/partner-checkout', () => ({ openPartnerCheckout: checkout, PartnerCheckoutError: class extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))

import { sendPartnerPlanLink } from './partner-plan.actions'

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ user: { id: 'admin' } })
  tenant.mockResolvedValue({ isActive: true, email: 'partner@example.test', name: 'Partner' })
  checkout.mockResolvedValue({ url: 'https://checkout.example.test/session', planName: 'Plan', amountTotal: 100000, currency: 'brl', expiresAt: new Date('2026-11-01') })
})
afterEach(() => vi.unstubAllEnvs())

describe('BMS partner checkout entry', () => {
  it.each([
    ['https://bms.example.test', 'https://bms.example.test'],
    [undefined, 'http://localhost:3001'],
  ])('returns checkout to the existing contracts route: %s', async (configured, expected) => {
    vi.stubEnv('BMS_URL', configured)
    expect(await sendPartnerPlanLink('tenant-1', 'plan-1', 'cash')).toEqual({ ok: true, data: { email: 'partner@example.test' } })
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', planId: 'plan-1', currency: 'brl',
      successUrl: `${expected}/sales/contracts?status=success`,
      cancelUrl: `${expected}/sales/contracts?status=cancel`,
    }))
    expect(mail).toHaveBeenCalledOnce()
  })

  it('rejects a manual coupon in the Stripe link action', async () => {
    coupon.mockResolvedValue(null)
    expect(await sendPartnerPlanLink('tenant-1', 'plan-1', 'cash', 'manual-coupon')).toEqual({ ok: false, message: 'sale.couponNotApplicable' })
    expect(checkout).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
  })

  it('does not treat a B2C-only coupon as a global partner coupon', async () => {
    coupon.mockResolvedValue({ stripePromotionCodeId: 'promo-1', appliesTo: [], genCodePackages: [], subscriptions: [{ id: 'consumer-plan' }] })
    expect(await sendPartnerPlanLink('tenant-1', 'plan-1', 'cash', 'consumer-coupon')).toEqual({ ok: false, message: 'sale.couponNotApplicable' })
    expect(checkout).not.toHaveBeenCalled()
  })

  it('checks staff permission before reading or sending anything', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(sendPartnerPlanLink('tenant-1', 'plan-1', 'cash')).rejects.toThrow('FORBIDDEN')
    expect(tenant).not.toHaveBeenCalled()
    expect(checkout).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
  })
})
