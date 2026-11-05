import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), session: vi.fn(), admin: vi.fn(), sell: vi.fn(), assign: vi.fn(),
  transaction: vi.fn(), welcome: vi.fn(), email: vi.fn(), code: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => 'pt-BR' }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: mocks.session }))
vi.mock('@/lib/customer-access', () => ({ verifyCustomerAccessAdmin: mocks.admin }))
vi.mock('@/lib/prisma', () => ({ prisma: { businessCustomer: { create: mocks.create, update: mocks.update }, genCode: { findFirst: mocks.code }, $transaction: mocks.transaction } }))
vi.mock('@/lib/business-gencode-sale', () => ({ recordBusinessGenCodeSale: mocks.sell, BusinessSaleError: class extends Error {} }))
vi.mock('@/lib/business-gencode-recipient', () => ({ assignBusinessGenCode: mocks.assign }))
vi.mock('@/lib/email', () => ({ sendAppWelcomeEmail: mocks.welcome }))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: mocks.email }))
vi.mock('@genealogiq/services/credits', () => ({ InsufficientCreditsError: class extends Error {} }))
vi.mock('@genealogiq/services/partner-consumer-access', () => ({ PartnerConsumerAccessError: class extends Error {} }))
import { saveBusinessCustomer, sellBusinessGenCodes, deliverBusinessGenCode, resendBusinessGenCode } from './business-customer.actions'
const data = { name: 'Acme Print', tradeName: '', taxId: '11.222.333/0001-81', segment: 'PLAQUE_PRINTER' as const, contactName: '', email: '', phoneCountryCode: '55', phone: '', notes: '', isActive: true }
beforeEach(() => {
  vi.resetAllMocks()
  const session = { customerId: 'verified-tenant', user: { id: 'operator' } }
  mocks.session.mockResolvedValue(session); mocks.admin.mockResolvedValue(session)
  mocks.transaction.mockImplementation(async callback => callback({ fixture: 'transaction' }))
})
describe('B2B actions', () => {
  it('uses verified tenant scope for create and update and strips browser tenant fields', async () => {
    expect(await saveBusinessCustomer(undefined, { ...data, tenantId: 'forged' } as never)).toEqual({ ok: true, message: 'saved' })
    expect(mocks.create).toHaveBeenCalledWith({ data: { ...data, taxId: '11222333000181', tenant: { connect: { id: 'verified-tenant' } }, address: undefined } })
    await saveBusinessCustomer('company', data)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'company', tenantId: 'verified-tenant' }, data: { ...data, taxId: '11222333000181', address: undefined } })
  })
  it('rejects an invalid CNPJ and a fractional lot before database writes', async () => {
    expect(await saveBusinessCustomer(undefined, { ...data, taxId: 'bad' })).toEqual({ ok: false, message: 'invalidData' })
    expect(await sellBusinessGenCodes('company', { requestId: '00000000-0000-4000-8000-000000000001', quantity: 1.5, genCode: '' })).toEqual({ ok: false, message: 'invalidSale' })
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.sell).not.toHaveBeenCalled()
  })
  it('cannot save, sell or deliver without the required session or live administrator scope', async () => {
    mocks.session.mockRejectedValue(new Error('unauthorized'))
    await expect(saveBusinessCustomer(undefined, data)).rejects.toThrow('unauthorized')
    await expect(sellBusinessGenCodes('company', { requestId: '00000000-0000-4000-8000-000000000001', quantity: 50, genCode: '' })).rejects.toThrow('unauthorized')
    mocks.admin.mockRejectedValue(new Error('forbidden'))
    await expect(deliverBusinessGenCode('company', { genCode: 'ABC', firstName: 'Ana', lastName: 'Silva', email: 'ana@example.test' })).rejects.toThrow('forbidden')
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.sell).not.toHaveBeenCalled(); expect(mocks.assign).not.toHaveBeenCalled()
  })
  it('passes a 50-code sale with the authenticated actor and company', async () => {
    const input = { requestId: '00000000-0000-4000-8000-000000000001', quantity: 50, genCode: '' }
    expect(await sellBusinessGenCodes('reseller', input)).toEqual({ ok: true, message: 'saleRecorded' })
    expect(mocks.sell).toHaveBeenCalledWith(expect.anything(), { ...input, customerId: 'reseller', tenantId: 'verified-tenant', actorId: 'operator' })
  })
  it('reports completed delivery with mail pending and preserves the QR callback for the setup email', async () => {
    mocks.assign.mockResolvedValue({ genCode: 'ABC', consumer: { id: 'consumer', email: 'ana@example.test', firstName: 'Ana' }, emailId: 'receipt', needsOnboarding: true })
    mocks.email.mockResolvedValue('pending'); mocks.welcome.mockRejectedValue(new Error('provider unavailable'))
    expect(await deliverBusinessGenCode('reseller', { genCode: 'abc', firstName: 'Ana', lastName: 'Silva', email: 'ANA@example.test' })).toEqual({ ok: true, message: 'deliveredEmailPending' })
    expect(mocks.assign).toHaveBeenCalledWith({ fixture: 'transaction' }, expect.objectContaining({ genCode: 'ABC', email: 'ana@example.test', tenantId: 'verified-tenant', businessCustomerId: 'reseller', currency: 'BRL' }))
    expect(mocks.welcome).toHaveBeenCalledWith('ana@example.test', expect.stringMatching(/^[a-f0-9]{64}$/), 'Ana', '/qr/ABC')
  })
  it('cannot resend an unassigned or foreign-tenant recipient code', async () => {
    mocks.code.mockResolvedValue({ soldAt: new Date(), soldToAppUser: { isActive: true, email: 'ana@example.test', tenantId: 'another-tenant', role: 'APP_USER' } })
    expect(await resendBusinessGenCode('reseller', 'ABC')).toEqual({ ok: false, message: 'recipientUnavailable' })
    expect(mocks.code).toHaveBeenCalledWith(expect.objectContaining({ where: { genCode: 'ABC', tenantId: 'verified-tenant', businessSale: { customerId: 'reseller', tenantId: 'verified-tenant' } } }))
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.welcome).not.toHaveBeenCalled()
  })
})
