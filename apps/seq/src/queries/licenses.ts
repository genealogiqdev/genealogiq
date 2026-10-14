import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'

export type LicenseStatus = 'AVAILABLE' | 'SOLD' | 'ACTIVATED'

export async function getLicenses(status?: LicenseStatus) {
  const { customerId } = await verifyTenantSession()

  return prisma.genCode.findMany({
    where: {
      tenantId: customerId,
      ...(status ? { status } : {}),
    },
    select: {
      id:          true,
      genCode:     true,
      status:      true,
      printedAt:   true,
      soldAt:      true,
      soldVia:     true,
      soldToName:  true,
      activatedAt: true,
      createdAt:   true,
      appUser:       { select: { firstName: true, lastName: true } },
      soldToAppUser: { select: { firstName: true, lastName: true } },
      mintedInCycle: { select: { id: true, endAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getLicenseSummary() {
  const { customerId } = await verifyTenantSession()
  const where = { tenantId: customerId }

  const [total, available, sold, activated] = await Promise.all([
    prisma.genCode.count({ where }),
    prisma.genCode.count({ where: { ...where, status: 'AVAILABLE' } }),
    prisma.genCode.count({ where: { ...where, soldAt: { not: null } } }),
    prisma.genCode.count({ where: { ...where, status: 'ACTIVATED' } }),
  ])

  return { total, available, sold, activated }
}

/** Single license by genCode, tenant-scoped — for the detail page. */
export async function getLicenseByGenCode(genCode: string) {
  const { customerId } = await verifyTenantSession()

  return prisma.genCode.findFirst({
    where:  { genCode, tenantId: customerId },
    select: {
      id:          true,
      genCode:     true,
      status:      true,
      printedAt:   true,
      soldAt:      true,
      soldVia:     true,
      soldToName:  true,
      soldValue:   true,
      activatedAt: true,
      createdAt:   true,
      appUser:       { select: { id: true, firstName: true, lastName: true } },
      soldToAppUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      soldBy:        { select: { firstName: true, lastName: true } },
    },
  })
}

export type LicenseRow = Awaited<ReturnType<typeof getLicenses>>[number]
export type LicenseDetail = NonNullable<Awaited<ReturnType<typeof getLicenseByGenCode>>>
