import 'server-only'

import { cache } from 'react'
import { forbidden } from 'next/navigation'
import { verifyAdmin } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { isBmsStaff } from './staff-scope'

/** Recheck platform scope and current privilege, including older BMS sessions. */
export const verifyConsumerAdmin = cache(async () => {
  const session = await verifyAdmin()
  const operator = await prisma.user.findUnique({
    where: { id: session.user.id }, select: { role: true, isActive: true, tenantId: true },
  })
  if (!operator?.isActive || !isBmsStaff(operator) || !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(operator.role)) forbidden()
  return session
})
