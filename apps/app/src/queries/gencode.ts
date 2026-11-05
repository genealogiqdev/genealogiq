import 'server-only'

import { prisma } from '@/lib/prisma'

export async function getLicenseByGenCode(genCode: string) {
  return prisma.genCode.findUnique({
    where: { genCode },
    select: {
      id:        true,
      genCode:   true,
      status:    true,
      appUserId: true,
      // The partner, not the sale. Whether this code can still be activated is
      // a question for the credit ledger now — see canActivate.
      tenantId:  true,
      businessSaleId: true,
      soldToAppUserId: true,
    },
  })
}
