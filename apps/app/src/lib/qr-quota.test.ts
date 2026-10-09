import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { appUser: { findUnique: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/subscription', () => ({ getMemorialFeatures: vi.fn() }))
vi.mock('@/lib/extra-units', () => ({ getExtraUnits: vi.fn() }))
import { getQrQuotaStatus } from './qr-quota'
import { getMemorialFeatures } from '@/lib/subscription'
import { getExtraUnits } from '@/lib/extra-units'

const memorial = (id: string) => ({ id, role: 'APP_MEMO', createdAt: new Date('2026-01-01'), genCode: null })
beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.appUser.findUnique.mockResolvedValue({ id: 'guardian' })
  prismaMock.appUser.findMany.mockResolvedValue([1, 2, 3, 4, 5, 6].map((i) => memorial('m' + i)))
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'PREMIUM', qrCodeMax: 1, memorialsMax: 5, petsMax: 5 } as never)
  vi.mocked(getExtraUnits).mockResolvedValue(0)
})

describe('APP memorial QR access', () => {
  it('includes all five Premium human memorials independently of the personal QR', async () => {
    expect(await getQrQuotaStatus('guardian', 'guardian')).toEqual({ unlocked: true, rank: 1, limit: 1 })
    expect(await getQrQuotaStatus('guardian', 'm1')).toEqual({ unlocked: true, rank: 1, limit: 5 })
    expect(await getQrQuotaStatus('guardian', 'm5')).toEqual({ unlocked: true, rank: 5, limit: 5 })
    expect(await getQrQuotaStatus('guardian', 'm6')).toEqual({ unlocked: false, rank: 6, limit: 5 })
  })

  it('keeps the personal Free QR but denies a Free memorial', async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'FREE', qrCodeMax: 1, memorialsMax: 1, petsMax: 0 } as never)
    expect(await getQrQuotaStatus('guardian', 'guardian')).toEqual({ unlocked: true, rank: 1, limit: 1 })
    expect(await getQrQuotaStatus('guardian', 'm1')).toEqual({ unlocked: false, rank: 1, limit: 0 })
  })

  it('reads only accepted human guardianships and the viewing guardian plan', async () => {
    await getQrQuotaStatus('guardian', 'm1')
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith({
      where: { role: 'APP_MEMO', guardedBy: { some: { guardianId: 'guardian', status: 'ACCEPTED' } } },
      select: { id: true, role: true, createdAt: true, genCode: { select: { id: true } } },
    })
    expect(getMemorialFeatures).toHaveBeenCalledWith('guardian')
    expect(getExtraUnits).toHaveBeenCalledWith('guardian', 'QR_CODE')
  })

  it('rejects a non-guardian profile even below the plan limit', async () => {
    expect(await getQrQuotaStatus('guardian', 'unrelated')).toEqual({ unlocked: false, rank: 0, limit: 0 })
  })

  it('preserves purchased QR capacity and an independently activated plaque', async () => {
    vi.mocked(getExtraUnits).mockResolvedValue(1)
    expect(await getQrQuotaStatus('guardian', 'm6')).toEqual({ unlocked: true, rank: 6, limit: 6 })
    vi.mocked(getExtraUnits).mockResolvedValue(0)
    prismaMock.appUser.findMany.mockResolvedValue([{ ...memorial('licensed'), genCode: { id: 'physical' } }])
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'FREE', qrCodeMax: 1, memorialsMax: 1, petsMax: 0 } as never)
    expect(await getQrQuotaStatus('guardian', 'licensed')).toEqual({ unlocked: true, rank: 0, limit: 0 })
  })

  it('does not grant a missing personal profile access', async () => {
    prismaMock.appUser.findUnique.mockResolvedValue(null)
    expect(await getQrQuotaStatus('missing', 'missing')).toEqual({ unlocked: false, rank: 0, limit: 1 })
  })
})
