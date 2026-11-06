import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), update: vi.fn(), tx: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { genCode: { findMany: mocks.find }, $transaction: mocks.tx } }))
vi.mock('@/lib/email', () => ({ sendAppWelcomeEmail: vi.fn() }))
import { prepareGenCodePrintBatch, markGenCodeBatchPrinted } from './gencode.actions'
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ customerId: 'verified-tenant' })
  mocks.tx.mockImplementation(async callback => callback({ genCode: { updateMany: mocks.update } }))
  vi.stubEnv('APP_URL', 'https://genealogiq.com.br')
})
describe('stock QR printing', () => {
  it('prepares 20 unprinted codes in the verified tenant without a write or a customer', async () => {
    const codes = Array.from({ length: 20 }, (_, i) => ({ genCode: `CODE${i}` })); mocks.find.mockResolvedValue(codes)
    expect(await prepareGenCodePrintBatch(20)).toEqual({ ok: true, data: { codes: codes.map(code => code.genCode), appBaseUrl: 'https://genealogiq.com.br' } })
    expect(mocks.find).toHaveBeenCalledWith({ where: { tenantId: 'verified-tenant', status: 'AVAILABLE', printedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 20, select: { genCode: true } })
    expect(mocks.tx).not.toHaveBeenCalled()
  })
  it('rejects invalid quantities and insufficient unprinted stock', async () => {
    expect(await prepareGenCodePrintBatch(1.5)).toEqual({ ok: false, message: 'invalidSale' })
    expect(mocks.find).not.toHaveBeenCalled(); mocks.find.mockResolvedValue([])
    expect(await prepareGenCodePrintBatch(20)).toEqual({ ok: false, message: 'stockPrintUnavailable' })
  })
  it('guards all codes when confirming physical printing and rejects a changed or foreign code', async () => {
    mocks.update.mockResolvedValue({ count: 1 })
    expect(await markGenCodeBatchPrinted(['ABC', 'XYZ'])).toEqual({ ok: false, message: 'stockPrintUnavailable' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { tenantId: 'verified-tenant', status: 'AVAILABLE', genCode: { in: ['ABC','XYZ'] } }, data: { printedAt: expect.any(Date) } })
    mocks.update.mockResolvedValue({ count: 2 })
    expect(await markGenCodeBatchPrinted(['ABC', 'XYZ'])).toEqual({ ok: true, message: 'stockPrintRecorded' })
  })
})
