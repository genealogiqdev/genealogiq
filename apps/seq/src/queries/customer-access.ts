import 'server-only'

import type { Prisma } from '@genealogiq/db'
import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'

export function customerAccessSelect(tenantId: string) {
  const now = new Date()
  return {
    appSales: {
      where: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
      orderBy: { currentPeriodEnd: 'desc' as const }, take: 1,
      select: { currentPeriodEnd: true, subscription: { select: { code: true, name: true } } },
    },
    consumerAccessGrants: {
      where: { revokedAt: null, expiresAt: { gt: now },
        appSale: { tenantId, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } } },
      orderBy: { expiresAt: 'desc' as const }, take: 1, select: { id: true },
    },
  } satisfies Prisma.AppUserSelect
}

export function summarizeCustomerAccess(customer: {
  appSales: { currentPeriodEnd: Date | null; subscription: { name: string; code: string } }[]
  consumerAccessGrants: { id: string }[]
}) {
  const sale = customer.appSales[0]
  return { planName: sale?.subscription.name ?? 'Free', planCode: sale?.subscription.code ?? 'FREE',
    expiresAt: sale?.currentPeriodEnd ?? null, grantId: customer.consumerAccessGrants[0]?.id ?? null }
}

export async function getCustomerAccess(appUserId: string) {
  const { customerId } = await verifyTenantSession()
  const customer = await prisma.appUser.findFirst({ where: { id: appUserId, tenantId: customerId, role: 'APP_USER' },
    select: customerAccessSelect(customerId) })
  return customer ? summarizeCustomerAccess(customer) : null
}
