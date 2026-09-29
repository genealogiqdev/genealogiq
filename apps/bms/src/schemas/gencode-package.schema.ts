import { z } from 'zod'
import type { Translator } from './i18n'

export function getGenCodePackageOrderSchema(t: Translator) {
  return z.object({
    packageId: z.string().min(1, t('required')),
    tenantId: z.string().min(1, t('required')),
    discountCouponId: z.string().min(1, t('required')).optional().nullable(),
    quantity: z.number()
      .int(t('wholeNumber'))
      .positive(t('greaterThanZero')),
  })
}

export type GenCodePackageOrderFormValues = z.infer<ReturnType<typeof getGenCodePackageOrderSchema>>

