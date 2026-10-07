import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/dal'

export async function getManualCouponOptions(currency: string) {
  await verifyAdmin()
  const now = new Date()
  const livePrice = { currency, isActive: true, effectiveTo: null, effectiveFrom: { lte: now } }
  const [coupons, tenants, partners, consumers, packages] = await Promise.all([
    prisma.discountCoupon.findMany({
      where: { redemptionMode: 'manual', isActive: true, percentOff: 100, OR: [{ redeemBy: null }, { redeemBy: { gt: now } }] },
      include: { appliesTo: { select: { id: true } }, genCodePackages: { select: { id: true } }, subscriptions: { select: { id: true } }, _count: { select: { redemptions: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true, taxId: true }, orderBy: { name: 'asc' } }),
    prisma.partnerPlan.findMany({
      where: { isActive: true, prices: { some: livePrice } },
      include: { prices: { where: livePrice, orderBy: { effectiveFrom: 'desc' }, take: 1 } }, orderBy: { annualAllowance: 'asc' },
    }),
    prisma.subscription.findMany({
      where: { isActive: true, code: { not: 'FREE' }, termLength: { gt: 0 }, prices: { some: livePrice } },
      include: { prices: { where: livePrice, orderBy: { effectiveFrom: 'desc' }, take: 1 } }, orderBy: { name: 'asc' },
    }),
    prisma.genCodePackage.findMany({ where: { isActive: true }, orderBy: { minimumQuantity: 'asc' } }),
  ])

  return {
    coupons: coupons.filter((c) => c.maxRedemptions == null || c._count.redemptions < c.maxRedemptions).map((c) => ({
      id: c.id, code: c.code,
      productIds: [...c.appliesTo, ...c.genCodePackages, ...c.subscriptions].map((p) => p.id),
    })),
    tenants,
    products: [
      ...partners.map((p) => ({ id: p.id, name: p.name, kind: 'partner' as const, currency,
        amount: Number(p.prices[0].annualCashAmount), monthlyAmount: null as number | null,
        quantity: p.annualAllowance, minimumQuantity: 1, termMonths: 12 })),
      ...consumers.map((p) => ({ id: p.id, name: p.name, kind: 'consumer' as const, currency,
        amount: Number(p.prices[0].annualCashAmount),
        monthlyAmount: p.prices[0].installmentCount && p.prices[0].installmentAmount ? Number(p.prices[0].installmentAmount) : null,
        quantity: 1, minimumQuantity: 1, termMonths: p.termLength })),
      ...packages.map((p) => ({ id: p.id, name: p.name, kind: 'package' as const, currency: p.currency,
        amount: Number(p.unitPrice), monthlyAmount: null as number | null, quantity: p.minimumQuantity,
        minimumQuantity: p.minimumQuantity, termMonths: 12 })),
    ].filter((p) => p.amount > 0),
  }
}

export type ManualCouponOptions = Awaited<ReturnType<typeof getManualCouponOptions>>

export async function getManualCouponHistory() {
  await verifyAdmin()
  const rows = await prisma.couponRedemption.findMany({
    orderBy: { createdAt: 'desc' }, take: 50,
    include: {
      genCodeOrder: { select: { tenant: { select: { name: true } }, package: { select: { name: true } }, creditExpiresAt: true } },
      subscriptionCycle: { select: { endAt: true, planSnapshot: true, subscription: { select: { id: true, tenant: { select: { name: true } } } } } },
      appSale: { select: { currentPeriodEnd: true, appUser: { select: { firstName: true, lastName: true, email: true } }, subscription: { select: { name: true } } } },
    },
  })
  const operators = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } },
    select: { id: true, firstName: true, lastName: true },
  })
  const names = new Map(operators.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
  return rows.map((r) => ({
    id: r.id, code: r.code, kind: r.kind, source: r.source, reference: r.reference, quantity: r.quantity,
    currency: r.currency, externalAmount: r.externalAmount == null ? null : Number(r.externalAmount),
    subtotalAmount: Number(r.subtotalAmount), discountAmount: Number(r.discountAmount), totalAmount: Number(r.totalAmount),
    createdAt: r.createdAt, operator: names.get(r.createdById) ?? r.createdById,
    recipient: r.genCodeOrder?.tenant.name ?? r.subscriptionCycle?.subscription.tenant.name
      ?? (r.appSale ? `${r.appSale.appUser.firstName} ${r.appSale.appUser.lastName} (${r.appSale.appUser.email})` : r.recipientId),
    product: r.genCodeOrder?.package.name ?? r.appSale?.subscription.name
      ?? String((r.subscriptionCycle?.planSnapshot as { name?: string } | null)?.name ?? r.productId),
    endsAt: r.genCodeOrder?.creditExpiresAt ?? r.subscriptionCycle?.endAt ?? r.appSale?.currentPeriodEnd,
  }))
}
