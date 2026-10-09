import { getMemorialQrStatus, type MemorialQrStatus } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'
import { getMemorialFeatures } from '@/lib/subscription'
import { getExtraUnits } from '@/lib/extra-units'

export type QrQuotaStatus = MemorialQrStatus

export async function getQrQuotaStatus(guardianId: string, profileId: string): Promise<QrQuotaStatus> {
  const [guardian, memorials, features, extra] = await Promise.all([
    prisma.appUser.findUnique({ where: { id: guardianId }, select: { id: true } }),
    prisma.appUser.findMany({
      where: { role: 'APP_MEMO', guardedBy: { some: { guardianId, status: 'ACCEPTED' } } },
      select: { id: true, role: true, createdAt: true, genCode: { select: { id: true } } },
    }),
    getMemorialFeatures(guardianId),
    getExtraUnits(guardianId, 'QR_CODE'),
  ])

  // The personal profile no longer consumes a Premium memorial's QR slot.
  if (guardianId === profileId) {
    const limit = features.qrCodeMax + extra
    return { unlocked: !!guardian && limit > 0, rank: guardian ? 1 : 0, limit }
  }

  return getMemorialQrStatus(memorials, profileId, features, extra)
}
