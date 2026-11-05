import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ session: vi.fn(), company: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { businessCustomer: { findUnique: mocks.company } } }))
import { GET } from './route'
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ customerId: 'verified-tenant' }) })
describe('B2B breadcrumb scope', () => {
  it('resolves the company name with the verified tenant', async () => {
    mocks.company.mockResolvedValue({ name: 'Acme Print' })
    const response = await GET(new NextRequest('http://localhost/api/entity-name?type=business-customers&id=company'))
    expect(await response.json()).toEqual({ name: 'Acme Print' })
    expect(mocks.company).toHaveBeenCalledWith({ where: { id: 'company', tenantId: 'verified-tenant' }, select: { name: true } })
  })
  it('does not reveal a company outside that tenant', async () => {
    mocks.company.mockResolvedValue(null)
    const response = await GET(new NextRequest('http://localhost/api/entity-name?type=business-customers&id=foreign-company'))
    expect(response.status).toBe(404)
  })
})
