'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Field, FieldError, FieldLabel } from '@genealogiq/ui/field'
import { Input } from '@genealogiq/ui/input'
import { Separator } from '@genealogiq/ui/separator'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { sendGenCodePackageLink } from '@/actions/gencode-package.actions'
import {
  getGenCodePackageOrderSchema,
  type GenCodePackageOrderFormValues,
} from '@/schemas/gencode-package.schema'
import type { EligibleGenCodeCustomer, GenCodePackageRow } from '@/queries/gencode-packages'

interface Props {
  packageRow: GenCodePackageRow
  customers: EligibleGenCodeCustomer[]
}

export function NewGenCodeOrderForm({ packageRow, customers }: Props) {
  const t = useTranslations('GenCodePackages')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const router = useRouter()
  const form = useForm<GenCodePackageOrderFormValues>({
    resolver: zodResolver(getGenCodePackageOrderSchema(tErrors)),
    defaultValues: {
      packageId: packageRow.id,
      tenantId: '',
      quantity: packageRow.minimumQuantity,
    },
  })
  const quantity = useWatch({ control: form.control, name: 'quantity' })
  const safeQuantity = Number.isFinite(quantity) ? quantity : 0
  const total = packageRow.unitPrice * safeQuantity
  const money = (value: number) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: packageRow.currency,
  }).format(value)

  async function onSubmit(data: GenCodePackageOrderFormValues) {
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
          <input type="hidden" {...form.register('packageId')} />

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
                    hint: customer.taxId,
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

          <Controller
            name="quantity"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>{t('form.quantity')}</FieldLabel>
                <Input
                  type="number"
                  min={packageRow.minimumQuantity}
                  step="1"
                  value={Number.isFinite(field.value) ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  aria-invalid={fieldState.invalid}
                />
                {!fieldState.invalid && (
                  <p className="text-xs text-muted-foreground">
                    {t('form.minimumHint', { count: packageRow.minimumQuantity })}
                  </p>
                )}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('form.unitPrice')}</p>
              <p className="font-medium tabular-nums">{money(packageRow.unitPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('form.quantity')}</p>
              <p className="font-medium tabular-nums">{safeQuantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('form.total')}</p>
              <p className="text-lg font-bold tabular-nums">{money(total)}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{t('form.paymentNote')}</p>

          <div className="flex gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting || customers.length === 0}>
              {form.formState.isSubmitting ? t('form.sending') : t('form.send')}
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

