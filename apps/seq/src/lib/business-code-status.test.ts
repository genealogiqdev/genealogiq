import { describe, it, expect } from 'vitest'
import { getBusinessCodeState } from './business-code-status'
import { businessSaleSchema, getBusinessCustomerSchema } from '@/schemas/business-customer.schema'
import { identityTranslator } from '@/schemas/i18n'

const now = new Date('2026-11-05T12:00:00Z')
const code = { status: 'SOLD', soldAt: now, soldToAppUserId: null, reservation: { status: 'HELD', expiresAt: new Date('2027-01-01') } }
describe('reseller inventory states', () => {
  it('separates ready, delivered, activated, expired and returned codes', () => {
    expect(getBusinessCodeState(code, now)).toBe('available')
    expect(getBusinessCodeState({ ...code, soldToAppUserId: 'buyer' }, now)).toBe('assigned')
    expect(getBusinessCodeState({ ...code, status: 'ACTIVATED', reservation: { status: 'CONSUMED', expiresAt: now } }, now)).toBe('activated')
    expect(getBusinessCodeState({ ...code, reservation: { status: 'HELD', expiresAt: now } }, now)).toBe('expired')
    expect(getBusinessCodeState({ ...code, reservation: null }, now)).toBe('expired')
    expect(getBusinessCodeState({ ...code, soldAt: null }, now)).toBe('returned')
  })
  it('validates and normalizes CNPJ while keeping tenant duplicates a database rule', () => {
    const data = { name: '  Acme Print  ', tradeName: '', taxId: '11.222.333/0001-81', segment: 'PLAQUE_PRINTER', contactName: '', email: '', phoneCountryCode: '55', phone: '', notes: '', isActive: true }
    expect(getBusinessCustomerSchema(identityTranslator).parse(data)).toMatchObject({ name: 'Acme Print', taxId: '11222333000181' })
    expect(getBusinessCustomerSchema(identityTranslator).safeParse({ ...data, taxId: '11111111111111' }).success).toBe(false)
    expect(getBusinessCustomerSchema(identityTranslator).safeParse({ ...data, taxId: '11X222333000181' }).success).toBe(false)
  })
  it('accepts a 50-code lot and rejects fractions, excessive quantities, invalid money and multi-code selection', () => {
    const input = { requestId: '00000000-0000-4000-8000-000000000001', quantity: 50, genCode: '', unitValue: 25.5 }
    expect(businessSaleSchema.safeParse(input).success).toBe(true)
    for (const quantity of [0, -1, 1.5, 101]) expect(businessSaleSchema.safeParse({ ...input, quantity }).success).toBe(false)
    for (const unitValue of [-1, NaN, Infinity, 1.001]) expect(businessSaleSchema.safeParse({ ...input, unitValue }).success).toBe(false)
    expect(businessSaleSchema.safeParse({ ...input, genCode: 'ABC' }).success).toBe(false)
  })
})
