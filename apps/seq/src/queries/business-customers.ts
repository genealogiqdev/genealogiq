import 'server-only'
import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'

export async function getBusinessCustomers() {
  const { customerId } = await verifyTenantSession()
  return prisma.businessCustomer.findMany({
    where: { tenantId: customerId },
    select: { id: true, name: true, tradeName: true, taxId: true, segment: true, contactName: true,
      email: true, phone: true, isActive: true, createdAt: true,
      sales: { select: { genCodes: { select: { status: true, soldAt: true, soldToAppUserId: true,
        reservation: { select: { status: true, expiresAt: true } },
      } } } },
    }, orderBy: { createdAt: 'asc' },
  })
}
export async function getBusinessCustomer(id: string) {
  const { customerId } = await verifyTenantSession()
  return prisma.businessCustomer.findUnique({
    where: { id, tenantId: customerId }, include: { address: true,
      sales: { orderBy: { createdAt: 'desc' }, include: { genCodes: { select: {
        genCode: true, status: true, soldAt: true, soldToAppUserId: true,
        soldToAppUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        reservation: { select: { status: true, expiresAt: true } },
      } } } },
    },
  })
}
