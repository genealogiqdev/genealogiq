import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redeem, verify, revalidate, provision, ServiceError } = vi.hoisted(() => {
  class ServiceError extends Error { constructor(readonly reason: string) { super(reason) } }
  return { redeem: vi.fn(), verify: vi.fn(), revalidate: vi.fn(), provision: vi.fn(), ServiceError }
})
vi.mock('@/lib/dal', () => ({ verifyAdmin: verify }))
vi.mock('@/lib/billing', () => ({ provisionTenantAccess: provision }))
vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))
vi.mock('@genealogiq/services/manual-coupon', () => ({ redeemManualCoupon: redeem, ManualCouponError: ServiceError }))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: vi.fn() }))
vi.mock('@genealogiq/services/sale-notifications', () => ({ manualSaleEmailId: (id: string) => `manual-sale:${id}`, queueManualSaleEmail: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: vi.fn() } }))

import { applyManualCoupon, retryManualCouponEmail } from './manual-coupon.actions'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { queueManualSaleEmail } from '@genealogiq/services/sale-notifications'
import { prisma } from '@/lib/prisma'
import { getManualCouponSchema } from '@/schemas/manual-coupon.schema'

const valid = {
  requestId: 'dda467fa-62a2-410a-a323-9a7d89163480', couponId: 'coupon-1', productId: 'product-1',
  kind: 'package' as const, tenantId: 'tenant-1', quantity: 20, cadence: 'annual' as const,
  source: 'external_payment' as const, reference: 'InfinitePay 123', externalAmount: 500, confirmed: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ user: { id: 'verified-admin' } })
  redeem.mockResolvedValue({ id: 'redemption-1', kind: 'package', resultId: 'order-1', alreadyApplied: false })
  vi.mocked(deliverEmail).mockResolvedValue('sent')
})

describe('applyManualCoupon', () => {
  it('requires a privileged BMS session before validation or grant', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(applyManualCoupon(valid)).rejects.toThrow('FORBIDDEN')
    expect(redeem).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it('derives actor and currency from the session and locale, ignoring spoofed fields', async () => {
    expect(await applyManualCoupon({ ...valid, createdById: 'attacker', currency: 'USD' } as typeof valid)).toEqual({
      ok: true, data: { id: 'redemption-1', kind: 'package', resultId: 'order-1', alreadyApplied: false }, message: 'applied',
    })
    expect(redeem).toHaveBeenCalledExactlyOnceWith({ ...valid, createdById: 'verified-admin', currency: 'BRL' })
    expect(revalidate).toHaveBeenCalledWith('/sales/discount-coupons/redeem')
    expect(provision).toHaveBeenCalledExactlyOnceWith('tenant-1')
  })

  it.each([
    { confirmed: false }, { quantity: 20.5 }, { quantity: 10_001 }, { reference: '' },
    { externalAmount: null }, { externalAmount: 5.005 }, { tenantId: '' }, { requestId: '' },
    { kind: 'consumer' as const, consumerEmail: 'invalid' },
  ])('rejects invalid requests without granting: %j', async (overrides) => {
    expect(await applyManualCoupon({ ...valid, ...overrides })).toEqual({ ok: false, message: 'errors.invalid-data' })
    expect(redeem).not.toHaveBeenCalled()
  })

  it('allows a stock reconciliation with no new payment', async () => {
    expect(getManualCouponSchema((key) => key).safeParse({ ...valid, source: 'legacy_stock', externalAmount: null }).success).toBe(true)
  })

  it('keeps the settled sale successful and reports pending receipt delivery', async () => {
    vi.mocked(deliverEmail).mockResolvedValue('pending')
    expect(await applyManualCoupon(valid)).toMatchObject({ ok: true, message: 'appliedEmailPending', data: { emailPending: true } })
    expect(deliverEmail).toHaveBeenCalledExactlyOnceWith('manual-sale:redemption-1')
    expect(redeem).toHaveBeenCalledOnce()
  })

  it('requires the same admin boundary for a receipt retry', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(retryManualCouponEmail('receipt-1')).rejects.toThrow('FORBIDDEN')
    expect(deliverEmail).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('retries only the receipt and never repeats payment, provisioning or benefits', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (tx: unknown) => unknown)(prisma) as never)
    vi.mocked(queueManualSaleEmail).mockResolvedValue('manual-sale:receipt-1')
    expect(await retryManualCouponEmail('receipt-1')).toMatchObject({ ok: true, message: 'emailSent' })
    expect(deliverEmail).toHaveBeenCalledExactlyOnceWith('manual-sale:receipt-1', { force: true })
    expect(redeem).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it('does not send a receipt for an unavailable sale', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue(null)
    expect(await retryManualCouponEmail('receipt-1')).toEqual({ ok: false, message: 'emailUnavailable' })
    expect(deliverEmail).not.toHaveBeenCalled()
  })

  it('returns a translated business rejection and leaves UI caches alone', async () => {
    redeem.mockRejectedValue(new ServiceError('reference-used'))
    expect(await applyManualCoupon(valid)).toEqual({ ok: false, message: 'errors.reference-used' })
    expect(revalidate).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it('does not provision partner staff for a consumer activation', async () => {
    await applyManualCoupon({ ...valid, kind: 'consumer', consumerEmail: 'consumer@example.test' })
    expect(provision).not.toHaveBeenCalled()
  })

  it('keeps the sale successful with an explicit follow-up when an access invitation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    provision.mockRejectedValue(new Error('mail unavailable'))
    try {
      expect(await applyManualCoupon(valid)).toEqual({
        ok: true, message: 'appliedAccessPending',
        data: { id: 'redemption-1', kind: 'package', resultId: 'order-1', alreadyApplied: false, accessPending: true },
      })
      expect(redeem).toHaveBeenCalledOnce()
      expect(revalidate).toHaveBeenCalledWith('/customers')
    } finally { log.mockRestore() }
  })
})
