import 'server-only'

import { cache } from 'react'
import { forbidden } from 'next/navigation'
import { verifyTenantSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'

/** Reload privilege and affiliation; stale session roles cannot release Premium. */
export const canManageCustomerAccess = cache(async () => {
  const session = await verifyTenantSession()
  const operator = await prisma.user.findUnique({ where: { id: session.user.id },
    select: { isActive: true, role: true, tenantId: true, tenant: { select: { isActive: true } } },
  })
  return !!operator?.isActive && !!operator.tenant?.isActive && operator.tenantId === session.customerId
    && ['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(operator.role)
})

export async function verifyCustomerAccessAdmin() {
  const session = await verifyTenantSession()
  if (!await canManageCustomerAccess()) forbidden()
  return session
}
