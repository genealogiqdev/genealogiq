import 'server-only'
import { Prisma, type PrismaClient } from '@genealogiq/db'
import { reserveCreditForSale, InsufficientCreditsError } from '@genealogiq/services/credits'
import type { BusinessSaleInput } from '@/schemas/business-customer.schema'

export class BusinessSaleError extends Error {
  constructor(public reason: 'notFound' | 'inactive' | 'stockUnavailable' | 'creditsUnavailable' | 'requestConflict' | 'recipientUnavailable') { super(reason) }
}
type Input = BusinessSaleInput & { customerId: string; tenantId: string; actorId: string }
export async function recordBusinessGenCodeSale(db: PrismaClient, input: Input) {
  const replay = async (tx: Prisma.TransactionClient) => {
    const sale = await tx.businessGenCodeSale.findUnique({ where: { id: input.requestId }, include: { genCodes: true } })
    if (!sale) return false
    if (sale.tenantId !== input.tenantId || sale.customerId !== input.customerId || sale.quantity !== input.quantity
      || (sale.unitValue === null ? undefined : Number(sale.unitValue)) !== input.unitValue
      || sale.requestedCode !== input.genCode) throw new BusinessSaleError('requestConflict')
    return true
  }
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business_customers WHERE id = ${input.customerId} AND tenant_id = ${input.tenantId} FOR UPDATE`
      const customer = await tx.businessCustomer.findUnique({ where: { id: input.customerId, tenantId: input.tenantId } })
      if (!customer) throw new BusinessSaleError('notFound')
      if (await replay(tx)) return
      if (!customer.isActive) throw new BusinessSaleError('inactive')
      const codes = await tx.genCode.findMany({ where: { tenantId: input.tenantId, status: 'AVAILABLE',
        ...(input.genCode ? { genCode: { in: input.genCode.split(',') } } : {}),
      }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: input.quantity, select: { id: true, genCode: true } })
      if (codes.length !== input.quantity) throw new BusinessSaleError('stockUnavailable')
      const sale = await tx.businessGenCodeSale.create({ data: { id: input.requestId, tenantId: input.tenantId,
        customerId: input.customerId, soldById: input.actorId, quantity: input.quantity, unitValue: input.unitValue,
        requestedCode: input.genCode, codes: codes.map(code => code.genCode),
      } })
      for (const code of codes) {
        const updated = await tx.genCode.updateMany({ where: { id: code.id, tenantId: input.tenantId, status: 'AVAILABLE' },
          data: { status: 'SOLD', soldAt: sale.createdAt, soldVia: 'MANUAL', soldById: input.actorId,
            soldToName: customer.name, soldToAppUserId: null, soldValue: input.unitValue, businessSaleId: sale.id,
          },
        })
        if (updated.count !== 1) throw new BusinessSaleError('stockUnavailable')
        // Each reseller unit is isolated to this code with the source grant's expiry.
        await reserveCreditForSale({ tenantId: input.tenantId, genCodeId: code.id, committed: false,
          reseller: true, committedMonths: 0, actorId: input.actorId }, tx)
      }
    }, { timeout: 30000 })
  } catch (error) {
    if (error instanceof InsufficientCreditsError) throw new BusinessSaleError('creditsUnavailable')
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      if (await db.$transaction(replay)) return
    }
    throw error
  }
}
