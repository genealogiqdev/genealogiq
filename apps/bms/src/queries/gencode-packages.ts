import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal'
import { GENCODE_PACKAGE_CODE } from '@genealogiq/services/gencode-package'

export async function getGenCodePackage() {
  await verifySession()
  const row = await prisma.genCodePackage.findUnique({
    where: { code: GENCODE_PACKAGE_CODE },
  })
  if (!row) return null

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unitPrice: Number(row.unitPrice),
    currency: row.currency,
    minimumQuantity: row.minimumQuantity,
    isActive: row.isActive,
    stripeProductId: row.stripeProductId,
    stripePriceId: row.stripePriceId,
  }
}

export async function getGenCodeOrders() {
  await verifySession()
  const rows = await prisma.genCodeOrder.findMany({
    select: {
      id: true,
      status: true,
      quantity: true,
      currency: true,
      unitPrice: true,
      totalAmount: true,
      checkoutExpiresAt: true,
      paidAt: true,
      creditExpiresAt: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({
    ...row,
    unitPrice: Number(row.unitPrice),
    totalAmount: Number(row.totalAmount),
    createdBy: row.createdBy
      ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim()
      : null,
  }))
}

export async function getEligibleGenCodeCustomers() {
  await verifySession()
  const now = new Date()

  return prisma.tenant.findMany({
    where: {
      isActive: true,
      partnerSubscriptions: {
        some: {
          status: 'ACTIVE',
          currentCycle: {
            is: {
              status: 'ACTIVE',
              startAt: { lte: now },
              endAt: { gt: now },
            },
          },
        },
      },
    },
    select: { id: true, name: true, taxId: true },
    orderBy: { name: 'asc' },
  })
}

export type GenCodePackageRow = NonNullable<Awaited<ReturnType<typeof getGenCodePackage>>>
export type GenCodeOrderRow = Awaited<ReturnType<typeof getGenCodeOrders>>[number]
export type EligibleGenCodeCustomer = Awaited<ReturnType<typeof getEligibleGenCodeCustomers>>[number]

