import { z } from 'zod'
import type { Translator } from './i18n'

export function getGenCodePackageOrderSchema(t: Translator) {
  return z.object({
    packageId: z.string().min(1, t('required')),
    tenantId: z.string().min(1, t('required')),
    quantity: z.number()
      .int(t('wholeNumber'))
      .min(20, t('minQuantity', { count: 20 })),
  })
}

export type GenCodePackageOrderFormValues = z.infer<ReturnType<typeof getGenCodePackageOrderSchema>>

