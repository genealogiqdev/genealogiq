'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { done, fail, ok, type ActionResult } from '@genealogiq/core'
import {
  GenCodePackageCheckoutError,
  openGenCodePackageCheckout,
  syncGenCodePackage,
} from '@genealogiq/services/gencode-package'
import { CHECKOUT_ORIGINS } from '@genealogiq/services/partner-checkout'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/dal'
import { sendSalePaymentLinkEmail } from '@/lib/email'
import {
  getGenCodePackageOrderSchema,
  type GenCodePackageOrderFormValues,
} from '@/schemas/gencode-package.schema'
import { identityTranslator } from '@/schemas/i18n'

export async function syncGenCodePackageWithStripe(packageId: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  try {
    await syncGenCodePackage(packageId)
    revalidatePath('/gencodes')
    return done(t('gencodePackage.synced'))
  } catch (error) {
    const message = error instanceof Error ? error.message : t('gencodePackage.unknownError')
    return fail(t('gencodePackage.stripeSyncFailed', { message }))
  }
}

export async function sendGenCodePackageLink(
  data: GenCodePackageOrderFormValues,
): Promise<ActionResult<{ email: string }>> {
  const session = await verifyAdmin()
  const t = await getTranslations('Actions')
  const validated = getGenCodePackageOrderSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('gencodePackage.invalidData'))

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.data.tenantId },
    select: { name: true, email: true },
  })
  if (!tenant) return fail(t('gencodePackage.tenantNotFound'))

  const baseUrl = process.env.BMS_URL ?? 'http://localhost:3001'

  try {
    const checkout = await openGenCodePackageCheckout({
      ...validated.data,
      createdById: session.user.id,
      origin: CHECKOUT_ORIGINS.bms,
      successUrl: `${baseUrl}/payment/gencodes?status=success`,
      cancelUrl: `${baseUrl}/payment/gencodes?status=cancel`,
    })

    const amount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: checkout.currency,
    }).format(checkout.totalAmount)

    await sendSalePaymentLinkEmail({
      to: tenant.email,
      url: checkout.url,
      tenantName: tenant.name,
      productName: checkout.packageName,
      quantity: checkout.quantity,
      amount,
      expiresAt: checkout.expiresAt,
    })

    revalidatePath('/gencodes')
    return ok({ email: tenant.email }, t('gencodePackage.linkSent', { email: tenant.email }))
  } catch (error) {
    if (error instanceof GenCodePackageCheckoutError) {
      const keyByReason = {
        'package-not-found': 'packageNotFound',
        'package-not-synced': 'packageNotSynced',
        'invalid-quantity': 'invalidQuantity',
        'tenant-not-eligible': 'tenantNotEligible',
        'no-url': 'noCheckoutUrl',
      } as const
      return fail(t(`gencodePackage.${keyByReason[error.reason]}`))
    }
    const message = error instanceof Error ? error.message : t('gencodePackage.unknownError')
    return fail(t('gencodePackage.linkFailed', { message }))
  }
}

