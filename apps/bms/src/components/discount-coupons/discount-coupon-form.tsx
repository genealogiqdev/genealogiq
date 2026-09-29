'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner'
import {
  getDiscountCouponSchema,
  discountCouponDefaultValues,
  type DiscountCouponFormValues,
} from '@/schemas/discount-coupon.schema'
import { createDiscountCoupon } from '@/actions/discount-coupon.actions'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@genealogiq/ui/select'
import { Checkbox } from '@genealogiq/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@genealogiq/ui/field'

interface ProductOption {
  id:       string
  name:     string
  price:    number
  quantity: number
  currency: string
  kind:     'partner-plan' | 'gencode-package'
}

interface DiscountCouponFormProps {
  products: ProductOption[]
}

function AmountField({
  control, name, label, symbol,
}: {
  control: Control<DiscountCouponFormValues>
  name:    'amountOffUsd' | 'amountOffBrl' | 'amountOffMxn'
  label:   string
  symbol:  string
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>{label}</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-muted-foreground">
              {symbol}
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              className="pl-10"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
              aria-invalid={fieldState.invalid}
            />
          </div>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

export function DiscountCouponForm({ products }: DiscountCouponFormProps) {
  const t    = useTranslations('DiscountCoupons')
  const tc   = useTranslations('Common')
  const tErr = useTranslations('Errors')
  const locale = useLocale()
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  const [serverError, setServerError] = useState<string | null>(null)
  const router = useRouter()

  const form = useForm<DiscountCouponFormValues>({
    resolver:      useMemo(() => zodResolver(getDiscountCouponSchema(tErr)), [tErr]),
    defaultValues: discountCouponDefaultValues,
  })

  const { control, handleSubmit, watch, formState: { isSubmitting } } = form
  const duration     = watch('duration')
  const discountType = watch('discountType')

  async function onSubmit(data: DiscountCouponFormValues) {
    setServerError(null)
    const result = await createDiscountCoupon(data)
    if (!result.ok) {
      setServerError(result.message)
    } else {
      if (result.message) toast.success(result.message)
      router.push('/sales/discount-coupons')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {serverError && <FieldError>{serverError}</FieldError>}

      <FieldGroup>
        <Controller
          name="code"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>{t('fields.code')}</FieldLabel>
              <Input
                {...field}
                autoComplete="off"
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                placeholder={t('placeholders.code')}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>{t('fields.description')}</FieldLabel>
              <Textarea
                {...field}
                value={field.value ?? ''}
                rows={2}
                placeholder={t('placeholders.descriptionCreate')}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* A percentage has no currency; a fixed amount is money and needs one
            slot per currency, like every other price in this catalogue. Leaving
            one at zero means the coupon is simply not offered there. */}
        {discountType === 'amount' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AmountField control={control} name="amountOffUsd" label="USD" symbol="$" />
            <AmountField control={control} name="amountOffMxn" label="MXN" symbol="MX$" />
            <AmountField control={control} name="amountOffBrl" label="BRL" symbol="R$" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            name="discountType"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel>{t('fields.discountType')}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{t('discountType.percent')}</SelectItem>
                    <SelectItem value="amount">{t('discountType.amount')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          {discountType === 'percent' && (
            <Controller
              name="percentOff"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.percent')}</FieldLabel>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            name="duration"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel>{t('fields.duration')}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">{t('durationOption.once')}</SelectItem>
                    <SelectItem value="forever">{t('durationOption.forever')}</SelectItem>
                    <SelectItem value="repeating">{t('durationOption.repeating')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          {duration === 'repeating' && (
            <Controller
              name="durationInMonths"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.durationInMonths')}</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            name="maxRedemptions"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t('fields.maxRedemptions')}</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t('placeholders.maxRedemptions')}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="redeemBy"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t('fields.expiresOn')}</FieldLabel>
                <Input
                  type="date"
                  value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : new Date(e.target.value))}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        {products.length > 0 && (
          <Controller
            name="appliesTo"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel>{t('fields.appliesTo')}</FieldLabel>
                <p className="text-xs text-muted-foreground">{t('hints.appliesTo')}</p>
                <div className="flex flex-col gap-2 mt-1">
                  {products.map((p) => {
                    const checked = field.value.includes(p.id)
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            const next = c
                              ? [...field.value, p.id]
                              : field.value.filter((id) => id !== p.id)
                            field.onChange(next)
                          }}
                        />
                        <span>
                          {t(`productKind.${p.kind === 'partner-plan' ? 'partnerPlan' : 'gencodePackage'}`)}: {p.name}
                          <span className="text-muted-foreground"> — {t('packageMeta', { quantity: p.quantity, price: money(p.price, p.currency) })}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </Field>
            )}
          />
        )}
      </FieldGroup>

      <Field orientation="horizontal">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? tc('saving') : t('create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => form.reset()}>
          {tc('reset')}
        </Button>
      </Field>
    </form>
  )
}
