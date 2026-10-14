import { z } from 'zod'
import { GENCODE_PACKAGE_OFFER } from '@genealogiq/core'
import type { Translator } from './i18n'

export function getGenCodePackagePurchaseSchema(t: Translator) {
  return z.object({
    quantity: z.number()
      .int(t('invalidQuantity'))
      .min(GENCODE_PACKAGE_OFFER.minimumQuantity, t('minimumQuantity', {
        count: GENCODE_PACKAGE_OFFER.minimumQuantity,
      })),
  })
}

export type GenCodePackagePurchaseValues = z.infer<ReturnType<typeof getGenCodePackagePurchaseSchema>>
