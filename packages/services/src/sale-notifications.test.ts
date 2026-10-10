import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@genealogiq/db'

const { queue } = vi.hoisted(() => ({ queue: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./email-outbox', () => ({ enqueueEmail: queue, notificationUrl: (app: string, path: string) => `https://${app}.genealogiq.test${path}` }))
import { queueManualSaleEmail, queuePackageSaleEmail, queuePartnerInvoiceEmail, queueConsumerInvoiceEmail, invoiceSubscriptionId } from './sale-notifications'

const db = {
  couponRedemption: { findUnique: vi.fn() }, genCodeOrder: { findUnique: vi.fn() },
  partnerSubscription: { findUnique: vi.fn() }, appUser: { findUnique: vi.fn() }, subscription: { findUnique: vi.fn() },
}
const tx = db as unknown as Prisma.TransactionClient
const tenant = { id: 'tenant-1', email: 'partner@genealogiq.test', name: 'Parceiro', isActive: true }
const order = { id: 'order-1', tenantId: tenant.id, tenant, status: 'PAID', quantity: 20, package: { name: '20 GenCodes' }, creditExpiresAt: new Date('2027-10-09T15:00:00Z'), totalAmount: 1500, currency: 'BRL' }
const receipt = { id: 'receipt-1', genCodeOrder: order, subscriptionCycle: null, appSale: null, source: 'external_payment', reference: 'INFINITEPAY 123', externalAmount: 1400, currency: 'BRL' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-09T15:00:00Z'))
  queue.mockImplementation(async (_db, input) => input.id)
  db.couponRedemption.findUnique.mockResolvedValue(receipt)
  db.genCodeOrder.findUnique.mockResolvedValue(order)
})
afterEach(() => vi.useRealTimers())

describe('sale confirmation contracts', () => {
  it('queues an existing partner confirmation with the recorded payment and zero new charge', async () => {
    expect(await queueManualSaleEmail(tx, 'receipt-1')).toBe('manual-sale:receipt-1')
    expect(queue).toHaveBeenCalledWith(tx, expect.objectContaining({
      recipient: 'partner@genealogiq.test', expiresAt: new Date('2027-10-09T15:00:00Z'),
      message: expect.objectContaining({
        details: [
          { label: 'Referência', value: 'INFINITEPAY 123' }, { label: 'Produto', value: '20 GenCodes' },
          { label: 'GenCodes liberados', value: '20' }, { label: 'Válido até', value: '9 de outubro de 2027' },
          { label: 'Pagamento registrado', value: 'R$ 1.400,00' }, { label: 'Saldo a pagar nesta liberação', value: 'R$ 0,00' },
        ],
        action: { label: 'Acessar o Sequoia', url: 'https://seq.genealogiq.test/inventory/activations' },
      }),
    }))
  })

  it('does not describe old-stock reconciliation as a new payment', async () => {
    db.couponRedemption.findUnique.mockResolvedValue({ ...receipt, source: 'legacy_stock', externalAmount: null })
    await queueManualSaleEmail(tx, 'receipt-1')
    const sent = queue.mock.calls[0][1].message
    expect(sent.paragraphs[1]).toBe('Esta liberação regulariza um estoque anterior e não gera uma nova cobrança.')
    expect(sent.details.some((d: { label: string }) => d.label === 'Pagamento registrado')).toBe(false)
  })

  it('addresses the APP purchaser and links the exact consumer sale', async () => {
    db.couponRedemption.findUnique.mockResolvedValue({ ...receipt, genCodeOrder: null, appSale: {
      id: 'sale-1', appUserId: 'consumer-1', status: 'active', currentPeriodEnd: new Date('2027-10-09T15:00:00Z'),
      appUser: { email: 'ana@genealogiq.test', firstName: 'Ana', role: 'APP_USER', isActive: true }, subscription: { name: 'Premium' },
    } })
    await queueManualSaleEmail(tx, 'receipt-1')
    expect(queue.mock.calls[0][1]).toMatchObject({ recipient: 'ana@genealogiq.test', context: { type: 'consumer-sale', appUserId: 'consumer-1', saleId: 'sale-1' }, message: { action: { url: 'https://app.genealogiq.test/subscriptions' } } })
  })

  it.each([null, { ...receipt, genCodeOrder: null }, { ...receipt, genCodeOrder: { ...order, status: 'FAILED' } }, { ...receipt, genCodeOrder: { ...order, creditExpiresAt: new Date('2026-10-09T15:00:00Z') } }])('rejects an unavailable receipt without queueing: %j', async (value) => {
    db.couponRedemption.findUnique.mockResolvedValue(value)
    expect(await queueManualSaleEmail(tx, 'receipt-1')).toBeNull()
    expect(queue).not.toHaveBeenCalled()
  })

  it('records the paid package amount and exact quantity', async () => {
    expect(await queuePackageSaleEmail(tx, 'order-1')).toBe('package-sale:order-1')
    expect(queue.mock.calls[0][1].message.details).toContainEqual({ label: 'Total', value: 'R$ 1.500,00' })
    expect(queue.mock.calls[0][1].message.details).toContainEqual({ label: 'GenCodes liberados', value: '20' })
  })

  it('uses the paid invoice amount for each partner installment', async () => {
    db.partnerSubscription.findUnique.mockResolvedValue({ tenantId: tenant.id, tenant, plan: { name: 'Semente' }, currentCycle: null })
    expect(await queuePartnerInvoiceEmail(tx, 'sub-1', { id: 'in-1', amount_paid: 29900, currency: 'brl' } as never)).toBe('partner-invoice:in-1')
    expect(queue.mock.calls[0][1].message.details).toContainEqual({ label: 'Pagamento', value: 'R$ 299,00' })
  })

  it('makes failure notices obsolete once that invoice is paid', async () => {
    db.appUser.findUnique.mockResolvedValue({ email: 'ana@genealogiq.test', firstName: 'Ana', role: 'APP_USER', isActive: true })
    db.subscription.findUnique.mockResolvedValue({ name: 'Premium' })
    await queueConsumerInvoiceEmail(tx, { metadata: { userId: 'consumer-1', subscriptionId: 'premium' } } as never, { id: 'in-1' } as never, true)
    expect(queue.mock.calls[0][1]).toMatchObject({ id: 'consumer-invoice:in-1:failed', context: { supersededBy: 'consumer-invoice:in-1:paid' }, message: { details: [{ label: 'Plano', value: 'Premium' }] } })
  })

  it('supports current and older Stripe subscription references', () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub-current' } }, subscription: 'sub-old' } as never)).toBe('sub-current')
    expect(invoiceSubscriptionId({ subscription: { id: 'sub-old' } } as never)).toBe('sub-old')
    expect(invoiceSubscriptionId({} as never)).toBeNull()
  })
})
