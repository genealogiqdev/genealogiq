'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  getCustomerSchema,
  customerDefaultValues,
  type CustomerFormValues,
  type CustomerFormInput,
} from '@/schemas/customer.schema'
import { updateCustomer } from '@/actions/customer.actions'
import { maskCpf, maskCnpj, maskPhone } from '@/lib/masks'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { Switch } from '@genealogiq/ui/switch'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Separator } from '@genealogiq/ui/separator'
import { MaskedInput } from '@genealogiq/ui/masked-input'
import { AddressSection } from '@/components/address/address-section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genealogiq/ui/select'
import { Field, FieldError, FieldGroup, FieldLabel } from '@genealogiq/ui/field'
import { Checkbox } from '@genealogiq/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@genealogiq/ui/accordion'

const COUNTRY_CODE_OPTIONS = ['1', '52', '55'] as const

interface CustomerFormProps {
  id: string
  defaultValues?: CustomerFormValues
}

const ALWAYS_ACTIVE = ['dashboard', 'buySubscriptions', 'viewSubscriptions', 'customers', 'sales', 'system'] as const
const RECORDS_MODULES = [
  { name: 'moduleRecordsSuppliers', labelKey: 'suppliers' },
] as const
const CATEGORY_MODULES = [
  { name: 'moduleCategoriesSuppliers', labelKey: 'supplierCat' },
] as const

export function CustomerForm({ id, defaultValues }: CustomerFormProps) {
  const t   = useTranslations('Customers')
  const tc  = useTranslations('Common')
  const tErr = useTranslations('Errors')
  const [serverError, setServerError] = useState<string | null>(null)
  const router = useRouter()

  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver:      useMemo(() => zodResolver(getCustomerSchema(tErr)), [tErr]),
    defaultValues: defaultValues ?? customerDefaultValues,
  })

  const { control, handleSubmit, setValue, formState: { isSubmitting, errors } } = form

  const entityType  = useWatch({ control, name: 'entityType' })
  const isIndividual = entityType === 'INDIVIDUAL'

  async function onSubmit(data: CustomerFormValues) {
    setServerError(null)
    const result = await updateCustomer(id, data)
    if (!result.ok) {
      setServerError(result.message)
    } else if (result.message) {
      toast.success(result.message)
    }
  }

  return (
      <Card>
        <CardHeader>
          <CardTitle className="scroll-m-20 text-2xl font-bold tracking-tight">
            {t('edit')}
          </CardTitle>
          <CardAction>
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="isActive" className="text-sm cursor-pointer">
                    {field.value ? t('status.active') : t('status.inactive')}
                  </label>
                </div>
              )}
            />
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">

            <Accordion type="multiple" defaultValue={['business']} className="flex flex-col gap-2">

              {/* ── Business ── */}
              <AccordionItem value="business" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">{t('sections.business')}</AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Controller
                        name="entityType"
                        control={control}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel>{t('fields.type')}</FieldLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="COMPANY">{t('entityType.company')}</SelectItem>
                                <SelectItem value="INDIVIDUAL">{t('entityType.individual')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      />
                      <Controller
                        name="businessSegment"
                        control={control}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel>{t('fields.businessSegment')}</FieldLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="FUNERAL_HOME">{t('businessSegment.funeralHome')}</SelectItem>
                                <SelectItem value="MARBLE_SHOP">{t('businessSegment.marbleShop')}</SelectItem>
                                <SelectItem value="CEMETERY">{t('businessSegment.cemetery')}</SelectItem>
                                <SelectItem value="URN_MANUFACTURER">{t('businessSegment.urnManufacturer')}</SelectItem>
                                <SelectItem value="PLAQUE_PRINTER">{t('businessSegment.plaquePrinter')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Controller name="name" control={control} render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>{isIndividual ? t('fields.firstName') : t('fields.companyName')}</FieldLabel>
                          <Input {...field} autoComplete="off" aria-invalid={fieldState.invalid} />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )} />
                      <Controller name="tradeName" control={control} render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>{isIndividual ? t('fields.lastName') : t('fields.tradeName')}</FieldLabel>
                          <Input {...field} autoComplete="off" aria-invalid={fieldState.invalid} />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )} />
                    </div>

                    {isIndividual ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller name="taxId" control={control} render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>{t('fields.cpf')}</FieldLabel>
                            <MaskedInput value={field.value} onChange={field.onChange} maskFn={maskCpf} autoComplete="off" aria-invalid={fieldState.invalid} />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )} />
                        <Controller name="birthDate" control={control} render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>{t('fields.birthDate')}</FieldLabel>
                            <Input {...field} value={field.value ?? ''} type="date" aria-invalid={fieldState.invalid} />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Controller name="taxId" control={control} render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>{t('fields.cnpj')}</FieldLabel>
                            <MaskedInput value={field.value} onChange={field.onChange} maskFn={maskCnpj} autoComplete="off" aria-invalid={fieldState.invalid} />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )} />
                        <Controller name="stateRegistration" control={control} render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>{t('fields.stateRegistration')}</FieldLabel>
                            <Input {...field} value={field.value ?? ''} autoComplete="off" aria-invalid={fieldState.invalid} />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )} />
                        <Controller name="municipalRegistration" control={control} render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>{t('fields.municipalRegistration')}</FieldLabel>
                            <Input {...field} value={field.value ?? ''} autoComplete="off" aria-invalid={fieldState.invalid} />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )} />
                      </div>
                    )}
                  </FieldGroup>
                </AccordionContent>
              </AccordionItem>

              {/* ── Contact ── */}
              <AccordionItem value="contact" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">{t('sections.contact')}</AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <FieldGroup>
                    <Controller name="email" control={control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>{t('fields.email')}</FieldLabel>
                        <Input {...field} type="email" autoComplete="off" aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Controller name="phoneCountryCode" control={control} render={({ field }) => (
                        <Field>
                          <FieldLabel>{t('fields.countryCode')}</FieldLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COUNTRY_CODE_OPTIONS.map((code) => (
                                <SelectItem key={code} value={code}>{`+${code}`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )} />
                      <Controller name="phone" control={control} render={({ field, fieldState }) => (
                        <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel>{t('fields.phone')}</FieldLabel>
                          <MaskedInput value={field.value} onChange={field.onChange} maskFn={maskPhone} autoComplete="off" aria-invalid={fieldState.invalid} />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )} />
                    </div>

                    <Controller name="notes" control={control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>{t('fields.notes')}</FieldLabel>
                        <Textarea {...field} value={field.value ?? ''} rows={3} aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                  </FieldGroup>
                </AccordionContent>
              </AccordionItem>

              {/* ── Address ── */}
              <AccordionItem value="address" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">{t('sections.address')}</AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <AddressSection
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    control={control as any}
                    setValue={setValue}
                    errors={errors}
                    prefix="address"
                  />
                </AccordionContent>
              </AccordionItem>

              {/* ── Modules ── */}
              <AccordionItem value="modules" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">{t('sections.modules')}</AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">{t('modules.groups.alwaysActive')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {ALWAYS_ACTIVE.map((k) => (
                          <label key={k} className="flex items-center gap-2 text-sm opacity-50 cursor-not-allowed select-none">
                            <Checkbox checked disabled />
                            {t(`modules.labels.${k}`)}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">{t('modules.groups.records')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {RECORDS_MODULES.map(({ name, labelKey }) => (
                          <Controller key={name} name={name} control={control} render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              {t(`modules.labels.${labelKey}`)}
                            </label>
                          )} />
                        ))}
                        <label className="flex items-center gap-2 text-sm opacity-50 cursor-not-allowed select-none">
                          <Checkbox checked disabled />
                          {t('modules.labels.customers')}
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">{t('modules.groups.categories')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {CATEGORY_MODULES.map(({ name, labelKey }) => (
                          <Controller key={name} name={name} control={control} render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              {t(`modules.labels.${labelKey}`)}
                            </label>
                          )} />
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">{t('modules.groups.purchasing')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-sm opacity-50 cursor-not-allowed select-none">
                          <Checkbox checked disabled />
                          {t('modules.labels.buySubscriptions')}
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">{t('modules.groups.inventory')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-sm opacity-50 cursor-not-allowed select-none">
                          <Checkbox checked disabled />
                          {t('modules.labels.viewSubscriptions')}
                        </label>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>

            {serverError && <FieldError>{serverError}</FieldError>}
            <Field orientation="horizontal">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? tc('saving') : tc('save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => form.reset()}>
                {tc('reset')}
              </Button>
            </Field>
          </form>
        </CardContent>
      </Card>
  )
}
