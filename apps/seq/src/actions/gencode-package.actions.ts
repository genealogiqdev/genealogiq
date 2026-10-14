'use server'

import { getTranslations } from 'next-intl/server'
import { fail, ok, GENCODE_PACKAGE_OFFER, type ActionResult } from '@genealogiq/core'
import { GenCodePackageCheckoutError, openGenCodePackageCheckout } from '@genealogiq/services/gencode-package'
import { CHECKOUT_ORIGINS } from '@genealogiq/services/partner-checkout'
import { verifyTenantSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { getGenCodePackagePurchaseSchema, type GenCodePackagePurchaseValues } from '@/schemas/gencode-package.schema'

export async function purchaseGenCodePackage(
  data: GenCodePackagePurchaseValues,
): Promise<ActionResult<{ url: string }>> {
  const session = await verifyTenantSession()
  const t = await getTranslations('GenCodePackages')
  const parsed = getGenCodePackagePurchaseSchema(t).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? t('invalidQuantity'))

  // Product, tenant, operator, currency and discount are all resolved on the server.
  const product = await prisma.genCodePackage.findFirst({
    where: { code: GENCODE_PACKAGE_OFFER.code, currency: 'BRL', isActive: true },
    select: { id: true },
  })
  if (!product) return fail(t('unavailable'))

  const baseUrl = process.env.SEQUOIA_URL ?? 'http://localhost:3002'
  const back = `${baseUrl}/purchasing/packages`

  try {
    const checkout = await openGenCodePackageCheckout({
      packageId: product.id,
      tenantId: session.customerId,
      createdById: session.user.id,
      quantity: parsed.data.quantity,
      origin: CHECKOUT_ORIGINS.seq,
      successUrl: `${back}?status=success`,
      cancelUrl: `${back}?status=cancel`,
    })
    return ok({ url: checkout.url })
  } catch (error) {
    if (error instanceof GenCodePackageCheckoutError) {
      if (error.reason === 'invalid-quantity') return fail(t('invalidQuantity'))
      if (error.reason === 'tenant-inactive') return fail(t('tenantInactive'))
      if (error.reason === 'package-not-found' || error.reason === 'package-not-synced') {
        return fail(t('unavailable'))
      }
    }
    console.error('[seq] purchaseGenCodePackage failed', error)
    return fail(t('checkoutFailed'))
  }
}
