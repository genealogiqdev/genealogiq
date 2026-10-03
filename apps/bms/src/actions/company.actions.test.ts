import { beforeEach, describe, expect, it, vi } from 'vitest'
const { update, verifyAdmin, revalidatePath } = vi.hoisted(() => ({ update: vi.fn(), verifyAdmin: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { company: { update } } }))
vi.mock('@/lib/dal', () => ({ verifyAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
import { updateCompany } from './company.actions'
import type { CompanyFormValues } from '@/schemas/company.schema'
const input: CompanyFormValues = { legalName: 'Fixture Company', tradeName: 'Fixture', taxId: 'LOCAL-FIXTURE', email: 'fixture@genealogiq.test', phoneCountryCode: '55', phone: '5550100', isActive: true }
beforeEach(() => vi.resetAllMocks())
describe('BMS company authorization', () => {
  it('does not persist when administrator validation rejects', async () => {
    verifyAdmin.mockRejectedValue(new Error('forbidden'))
    await expect(updateCompany('company-1', input)).rejects.toThrow('forbidden')
    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('rejects malformed contact data before persisting', async () => {
    expect(await updateCompany('company-1', { ...input, email: 'invalid' })).toEqual({ ok: false, message: 'common.invalidData' })
    expect(update).not.toHaveBeenCalled()
  })
})
