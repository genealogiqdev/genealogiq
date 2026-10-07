'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Field, FieldError, FieldLabel } from '@genealogiq/ui/field'
import { Input } from '@genealogiq/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@genealogiq/ui/select'
import { Separator } from '@genealogiq/ui/separator'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { sendGenCodePackageLink } from '@/actions/gencode-package.actions'
import {
  getGenCodePackageOrderSchema,
  type GenCodePackageOrderFormValues,
} from '@/schemas/gencode-package.schema'
import type { GenCodeCustomer, GenCodePackageRow } from '@/queries/gencode-packages'
import type { SelectableCoupon } from '@/queries/discount-coupons'

const NO_COUPON = '__none__'

interface Props {
  packages: GenCodePackageRow[]
  customers: GenCodeCustomer[]
  coupons: SelectableCoupon[]
  initialPackageId?: string
}

export function NewGenCodeOrderForm({ packages, customers, coupons, initialPackageId }: Props) {
  const t = useTranslations('GenCodePackages')
  const tErrors = useTranslations('Errors')
  const tm = useTranslations('ManualCoupons')
  const locale = useLocale()
  const router = useRouter()
  const initialPackage = packages.find((item) => item.id === initialPackageId) ?? packages[0]
  const form = useForm<GenCodePackageOrderFormValues>({
    resolver: zodResolver(getGenCodePackageOrderSchema(tErrors)),
    defaultValues: {
      packageId: initialPackage?.id ?? '',
      tenantId: '',
      quantity: initialPackage?.minimumQuantity ?? 1,
      discountCouponId: null,
    },
  })

  const packageId = useWatch({ control: form.control, name: 'packageId' })
  const quantity = useWatch({ control: form.control, name: 'quantity' })
  const discountCouponId = useWatch({ control: form.control, name: 'discountCouponId' })
  const packageRow = packages.find((item) => item.id === packageId) ?? initialPackage
  const safeQuantity = Number.isFinite(quantity) ? quantity : 0
  const subtotalCents = Math.round((packageRow?.unitPrice ?? 0) * 100) * safeQuantity
  const eligibleCoupons = useMemo(
    () => coupons.filter((coupon) =>
      coupon.productIds.length === 0 || (!!packageRow && coupon.productIds.includes(packageRow.id)),
    ),
    [coupons, packageRow],
  )
  const coupon = eligibleCoupons.find((item) => item.id === discountCouponId)
  const manual = coupon?.redemptionMode === 'manual'
  const discountCents = coupon
    ? Math.min(
        subtotalCents,
        coupon.discountType === 'percent'
          ? Math.round(subtotalCents * coupon.value / 100)
          : Math.round(coupon.value * 100),
      )
    : 0
  const discount = discountCents / 100
  const total = (subtotalCents - discountCents) / 100
  const money = (value: number) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: packageRow?.currency ?? 'BRL',
  }).format(value)

  async function onSubmit(data: GenCodePackageOrderFormValues) {
    if (manual && data.discountCouponId) {
      router.push(`/sales/discount-coupons/redeem?${new URLSearchParams({
        couponId: data.discountCouponId, kind: 'package', productId: data.packageId,
        tenantId: data.tenantId, quantity: String(data.quantity),
      })}`)
      return
    }
    const result = await sendGenCodePackageLink(data)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success(result.message ?? t('form.sent'))
    router.push('/gencodes')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('form.title')}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Controller
            name="packageId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t('form.product')}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    const nextPackage = packages.find((item) => item.id === value)
                    if (nextPackage) {
                      form.setValue('quantity', nextPackage.minimumQuantity, { shouldValidate: true })
                    }
                    const selectedCoupon = coupons.find((item) => item.id === form.getValues('discountCouponId'))
                    if (selectedCoupon?.productIds.length && !selectedCoupon.productIds.includes(value)) {
                      form.setValue('discountCouponId', null)
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t('form.pickProduct')} /></SelectTrigger>
                  <SelectContent>
                    {packages.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} — {moneyFor(item.unitPrice, item.currency, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="tenantId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t('form.customer')}</FieldLabel>
                <SearchableSelect
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                    hint: `${customer.taxId} · ${t(`form.customerStatus.${customer.contractStatus}`)}`,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('form.pickCustomer')}
                  searchPlaceholder={t('form.searchCustomer')}
                  emptyMessage={t('form.noCustomers')}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <Controller
              name="quantity"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('form.quantity')}</FieldLabel>
                  <Input
                    type="number"
                    min={packageRow?.minimumQuantity ?? 1}
                    step="1"
                    value={Number.isFinite(field.value) ? field.value : ''}
                    onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-invalid={fieldState.invalid}
                  />
                  {!fieldState.invalid && packageRow && (
                    <p className="text-xs text-muted-foreground">
                      {t('form.minimumHint', { count: packageRow.minimumQuantity })}
                    </p>
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="discountCouponId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t('form.coupon')}</FieldLabel>
                  <Select
                    value={field.value ?? NO_COUPON}
                    onValueChange={(value) => field.onChange(value === NO_COUPON ? null : value)}
                  >
                    <SelectTrigger><SelectValue placeholder={t('form.noCoupon')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COUPON}>{t('form.noCoupon')}</SelectItem>
                      {eligibleCoupons.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.code} — {item.discountType === 'percent'
                            ? t('form.percentOff', { value: item.value })
                            : t('form.amountOff', { value: money(item.value) })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('form.couponHint')}</p>
                </Field>
              )}
            />
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('form.unitPrice')}</p>
              <p className="font-medium tabular-nums">{money(packageRow?.unitPrice ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('form.quantity')}</p>
              <p className="font-medium tabular-nums">{safeQuantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('form.discount')}</p>
              <p className="font-medium tabular-nums">− {money(discount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('form.total')}</p>
              <p className="text-lg font-bold tabular-nums">{money(total)}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{manual ? tm('description') : !packageRow?.stripePriceId ? tm('needsCoupon') : t('form.paymentNote')}</p>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || customers.length === 0 || packages.length === 0 || (!manual && !packageRow?.stripePriceId)}
            >
              {manual ? tm('review') : form.formState.isSubmitting ? t('form.sending') : t('form.send')}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/gencodes">{t('form.cancel')}</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function moneyFor(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
}
