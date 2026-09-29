import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal'

export async function getGenCodePackages(options: { sellableOnly?: boolean } = {}) {
  await verifySession()
  const rows = await prisma.genCodePackage.findMany({
    where: options.sellableOnly
      ? { isActive: true, stripeProductId: { not: null }, stripePriceId: { not: null } }
      : undefined,
    orderBy: [{ minimumQuantity: 'asc' }, { name: 'asc' }],
  })

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    unitPrice: Number(row.unitPrice),
    currency: row.currency,
    minimumQuantity: row.minimumQuantity,
    activationTrialMonths: row.activationTrialMonths,
    activationTrialPlanCode: row.activationTrialPlanCode,
    isActive: row.isActive,
    stripeProductId: row.stripeProductId,
    stripePriceId: row.stripePriceId,
  }))
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
      discountCode: true,
      discountAmount: true,
      totalAmount: true,
      checkoutExpiresAt: true,
      paidAt: true,
      creditExpiresAt: true,
      createdAt: true,
      package: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({
    ...row,
    unitPrice: Number(row.unitPrice),
    discountAmount: Number(row.discountAmount),
    totalAmount: Number(row.totalAmount),
    createdBy: row.createdBy
      ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim()
      : null,
  }))
}

export async function getGenCodeCustomers() {
  await verifySession()
  const now = new Date()

  const rows = await prisma.tenant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      taxId: true,
      businessSegment: true,
      partnerSubscriptions: {
        select: {
          status: true,
          currentCycle: {
            select: { status: true, startAt: true, endAt: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return rows.map(({ partnerSubscriptions, ...customer }) => {
    const hasCurrentContract = partnerSubscriptions.some((subscription) =>
      subscription.status === 'ACTIVE'
      && subscription.currentCycle?.status === 'ACTIVE'
      && subscription.currentCycle.startAt <= now
      && subscription.currentCycle.endAt > now,
    )

    return {
      ...customer,
      contractStatus: hasCurrentContract
        ? 'ACTIVE' as const
        : partnerSubscriptions.length > 0
          ? 'INACTIVE' as const
          : 'NEW' as const,
    }
  })
}

export type GenCodePackageRow = Awaited<ReturnType<typeof getGenCodePackages>>[number]
export type GenCodeOrderRow = Awaited<ReturnType<typeof getGenCodeOrders>>[number]
export type GenCodeCustomer = Awaited<ReturnType<typeof getGenCodeCustomers>>[number]
