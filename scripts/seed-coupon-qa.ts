import { config } from 'dotenv'

config({ path: 'packages/db/.env' })
const target = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/genealogiq') {
  throw new Error('Coupon browser fixtures require the loopback genealogiq database')
}
const run = process.argv.find((arg) => arg.startsWith('--run='))?.slice(6)
if (!run || !/^[a-z0-9-]{3,32}$/.test(run)) throw new Error('Usage: pnpm exec tsx scripts/seed-coupon-qa.ts --run=20261007')

async function main() {
  const { prisma } = await import('@genealogiq/db')
  try {
    const seeded = await prisma.user.findUniqueOrThrow({ where: { email: 'local-admin@genealogiq.test' }, select: { password: true } })
    if (!seeded.password) throw new Error('Run the normal seed:local identity setup first')
    await prisma.discountCoupon.findFirstOrThrow({ where: { code: { equals: 'Gen2026', mode: 'insensitive' }, redemptionMode: 'manual' } })
    const free = await prisma.subscription.upsert({
      where: { code: 'FREE' }, update: {},
      create: { code: 'FREE', name: 'Free', termLength: 0, treeMaxMembers: 32, bioMaxChars: 2048,
        mediaMaxImages: 32, mediaMaxVideos: 8, documentsMax: 16, geoPlacesMax: 3, memorialsMax: 1, petsMax: 0, qrCodeMax: 1 },
    })
    const prefix = `coupon-qa-${run}`
    const stock = await prisma.tenant.upsert({
      where: { taxId: `${prefix}-stock` }, update: {},
      create: { name: `Cupom QA Estoque ${run}`, tradeName: 'Cupom QA Estoque', taxId: `${prefix}-stock`, email: `${prefix}-stock@genealogiq.test`, entityType: 'COMPANY', phone: '5550100' },
    })
    const partner = await prisma.tenant.upsert({
      where: { taxId: `${prefix}-partner` }, update: {},
      create: { name: `Cupom QA Novo ${run}`, tradeName: 'Cupom QA Novo', taxId: `${prefix}-partner`, email: `${prefix}-partner@genealogiq.test`, entityType: 'COMPANY', phone: '5550101' },
    })
    const staff = await prisma.user.upsert({
      where: { email: `${prefix}-partner@genealogiq.test` }, update: {},
      create: { email: `${prefix}-partner@genealogiq.test`, firstName: 'Cupom QA', lastName: 'Parceiro', password: seeded.password, role: 'ADMIN', emailVerified: new Date(), tenantId: partner.id },
    })
    const firstAccess = await prisma.tenant.upsert({
      where: { taxId: `${prefix}-first-access` }, update: {},
      create: { name: `Cupom QA Primeiro acesso ${run}`, tradeName: 'Cupom QA Primeiro acesso', taxId: `${prefix}-first-access`,
        email: `${prefix}-owner@genealogiq.test`, entityType: 'COMPANY', phone: '5550102' },
    })
    const owner = await prisma.user.upsert({
      where: { email: `${prefix}-owner@genealogiq.test` }, update: {},
      // Inactive like createCustomer's owner. The public fixture password lets
      // QA verify the payment gate without sending mail or resetting credentials.
      create: { email: `${prefix}-owner@genealogiq.test`, firstName: 'Cupom QA', lastName: 'Novo responsável',
        password: seeded.password, role: 'OWNER', isActive: false, emailVerified: new Date(), tenantId: firstAccess.id },
    })
    const viewer = await prisma.user.upsert({
      where: { email: `${prefix}-viewer@genealogiq.test` }, update: {},
      create: { email: `${prefix}-viewer@genealogiq.test`, firstName: 'Cupom QA', lastName: 'Sem permissão', password: seeded.password, role: 'USER', emailVerified: new Date() },
    })
    const buyer = await prisma.appUser.upsert({
      where: { email: `${prefix}-consumer@genealogiq.test` }, update: {},
      create: { email: `${prefix}-consumer@genealogiq.test`, firstName: 'Cupom QA', lastName: 'Cliente', password: seeded.password, role: 'APP_USER', emailVerified: new Date() },
    })
    const product = await prisma.genCodePackage.upsert({
      where: { code: `${prefix}-package` }, update: {},
      create: { code: `${prefix}-package`, name: `Cupom QA Pacote ${run}`, unitPrice: 50, currency: 'BRL', minimumQuantity: 2 },
    })
    const plan = await prisma.partnerPlan.upsert({
      where: { code: `${prefix}-plan` }, update: {},
      create: { code: `${prefix}-plan`, name: `Cupom QA Plano ${run}`, annualAllowance: 20, activationTrialMonths: 12, activationTrialPlanCode: 'PREMIUM' },
    })
    const consumerPlan = await prisma.subscription.upsert({
      where: { code: `${prefix}-consumer-plan` }, update: {},
      create: { code: `${prefix}-consumer-plan`, name: `Cupom QA Premium ${run}`, termLength: 12, treeMaxMembers: 128,
        bioMaxChars: 8192, mediaMaxImages: 128, mediaMaxVideos: 32, documentsMax: 64, geoPlacesMax: 12, memorialsMax: 5, petsMax: 2, qrCodeMax: 5 },
    })
    for (const currency of ['BRL', 'USD', 'MXN']) {
      for (const [id, owner, amount, monthly] of [
        [`${prefix}-partner-${currency}`, { partnerPlanId: plan.id }, 1000, null],
        [`${prefix}-consumer-${currency}`, { subscriptionId: consumerPlan.id }, 240, 24],
        [`local-free-${currency}`, { subscriptionId: free.id }, 0, null],
      ] as const) {
        const existing = await prisma.planPrice.findFirst({ where: { ...owner, currency, isActive: true, effectiveTo: null } })
        if (!existing) await prisma.planPrice.create({ data: { id, ...owner, currency, annualCashAmount: amount,
          installmentCount: monthly ? 12 : null, installmentAmount: monthly, effectiveFrom: new Date('2020-01-01') } })
      }
    }
    const initial = await prisma.creditGrant.findUnique({ where: { id: `${prefix}-stock-grant` } })
    if (!initial) await prisma.$transaction(async (tx) => {
      const grant = await tx.creditGrant.create({ data: { id: `${prefix}-stock-grant`, tenantId: stock.id, source: 'TOPUP', grantedQty: 5, remainingQty: 5, expiresAt: new Date('2099-01-01') } })
      await tx.creditTransaction.create({ data: { grantId: grant.id, tenantId: stock.id, type: 'GRANT', quantity: 5, balanceAfter: 5, idempotencyKey: `${prefix}-initial-stock` } })
      const { generateGenCode } = await import('../packages/core/src/gen-code')
      await tx.genCode.createMany({ data: Array.from({ length: 5 }, () => ({ genCode: generateGenCode(), tenantId: stock.id })) })
    })
    console.log(JSON.stringify({ run, stockTenantId: stock.id, partnerTenantId: partner.id, packageId: product.id, planId: plan.id,
      consumerPlanId: consumerPlan.id, consumerEmail: buyer.email, partnerEmail: staff.email, viewerEmail: viewer.email,
      firstAccessTenantId: firstAccess.id, ownerEmail: owner.email }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
