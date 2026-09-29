import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale } from '@genealogiq/core'
import { DiscountCouponForm } from '@/components/discount-coupons/discount-coupon-form'
import { getActiveProductsForSelect } from '@/queries/discount-coupons'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Separator } from '@genealogiq/ui/separator'
import { FormShell } from '@genealogiq/ui/form-shell'

export default async function NewDiscountCouponPage() {
  const products = await getActiveProductsForSelect(currencyForLocale(await getLocale()))
  const t = await getTranslations('DiscountCoupons')

  return (
    <FormShell>
      <Card>
        <CardHeader>
          <CardTitle className="scroll-m-20 text-2xl font-bold tracking-tight">
            {t('new')}
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent>
          <DiscountCouponForm
            products={products}
          />
        </CardContent>
      </Card>
    </FormShell>
  )
}
