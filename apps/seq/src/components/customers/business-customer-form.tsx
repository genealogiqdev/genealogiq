'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { Field, FieldLabel, FieldError } from '@genealogiq/ui/field'
import { AddressSection } from '@/components/address/address-section'
import { saveBusinessCustomer } from '@/actions/business-customer.actions'
import { BUSINESS_SEGMENTS, businessCustomerDefaults, getBusinessCustomerSchema, type BusinessCustomerFormValues } from '@/schemas/business-customer.schema'

const textFields = ['name', 'tradeName', 'taxId', 'contactName', 'email', 'phoneCountryCode', 'phone'] as const
export function BusinessCustomerForm({ id, defaultValues }: { id?: string; defaultValues?: BusinessCustomerFormValues }) {
  const t = useTranslations('BusinessCustomers')
  const te = useTranslations('Errors')
  const router = useRouter()
  const [error, setError] = useState('')
  const { register, control, setValue, handleSubmit, formState: { errors, isSubmitting } } = useForm<BusinessCustomerFormValues>({
    resolver: useMemo(() => zodResolver(getBusinessCustomerSchema(te)), [te]), defaultValues: defaultValues ?? businessCustomerDefaults,
  })
  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={handleSubmit(async values => {
      setError('')
      try {
        const result = await saveBusinessCustomer(id, values)
        if (!result.ok) { setError(result.message); return }
        toast.success(result.message)
        router.push('/customers?type=business')
        router.refresh()
      } catch { setError(t('saveFailed')) }
    })}>
      <div className="grid gap-4 sm:grid-cols-2">
        {textFields.map(name => (
          <Field key={name} data-invalid={!!errors[name]}>
            <FieldLabel htmlFor={`business-${name}`}>{t(`fields.${name}`)}</FieldLabel>
            <Input id={`business-${name}`} {...register(name)} type={name === 'email' ? 'email' : 'text'} aria-invalid={!!errors[name]} />
            {errors[name] && <FieldError errors={[errors[name]]} />}
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="business-segment">{t('fields.segment')}</FieldLabel>
          <select id="business-segment" {...register('segment')} className="border-input rounded-md border bg-transparent p-2">
            {BUSINESS_SEGMENTS.map(segment => <option key={segment} value={segment}>{t(`segments.${segment}`)}</option>)}
          </select>
        </Field>
      </div>
      <AddressSection control={control as unknown as Parameters<typeof AddressSection>[0]['control']} setValue={setValue} errors={errors} prefix="address" />
      <Field>
        <FieldLabel htmlFor="business-notes">{t('fields.notes')}</FieldLabel>
        <Textarea id="business-notes" {...register('notes')} aria-invalid={!!errors.notes} />
        {errors.notes && <FieldError errors={[errors.notes]} />}
      </Field>
      <label className="flex items-center gap-2" htmlFor="business-active">
        <input id="business-active" type="checkbox" {...register('isActive')} />{t('fields.isActive')}
      </label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t('saving') : t('save')}</Button>
        <Button variant="outline" asChild><Link href="/customers?type=business">{t('back')}</Link></Button>
      </div>
    </form>
  )
}
