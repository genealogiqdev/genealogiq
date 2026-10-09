import 'server-only'

import { prisma, type Prisma } from '@genealogiq/db'
import { verifyConsumerAdmin } from '@/lib/consumer-access'

export async function getConsumers(query = '', page = 1, status = 'all') {
  await verifyConsumerAdmin()
  const search = query.trim().slice(0, 320)
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100_000) : 1
  const currentStatus = status === 'active' || status === 'inactive' ? status : 'all'
  const textSearch = { contains: search, mode: 'insensitive' } as const
  const where: Prisma.AppUserWhereInput = {
    role: 'APP_USER',
    ...(currentStatus !== 'all' ? { isActive: currentStatus === 'active' } : {}),
    ...(search ? { OR: [
      { firstName: textSearch }, { lastName: textSearch }, { email: textSearch },
      { tenant: { is: { OR: [
        { name: textSearch }, { tradeName: textSearch },
      ] } } },
    ] } : {}),
  }
  const [total, consumers] = await Promise.all([
    prisma.appUser.count({ where }),
    prisma.appUser.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 25, skip: (currentPage - 1) * 25,
      select: {
        id: true, firstName: true, lastName: true, email: true, isActive: true, createdAt: true, tenantId: true,
        tenant: { select: { id: true, name: true, tradeName: true } },
        appSales: {
          where: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: new Date() } },
          orderBy: { currentPeriodEnd: 'desc' }, take: 1,
          select: { currentPeriodEnd: true, subscription: { select: { name: true } } },
        },
        consumerAccessGrants: {
          orderBy: { createdAt: 'desc' }, take: 1, select: { expiresAt: true, emailSentAt: true },
        },
      },
    }),
  ])
  return { total, consumers, status: currentStatus, page: currentPage, pages: Math.max(1, Math.ceil(total / 25)) }
}

export async function getConsumerForRegistration(id: string) {
  await verifyConsumerAdmin()
  return prisma.appUser.findFirst({
    where: { id, tenantId: null, role: 'APP_USER', isActive: true },
    select: { firstName: true, lastName: true, email: true },
  })
}
