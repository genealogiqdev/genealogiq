'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CheckIcon } from 'lucide-react'
import {
  getCustomerCreateSchema,
  customerCreateDefaultValues,
  type CustomerCreateFormValues,
  type CustomerCreateFormInput,
} from '@/schemas/customer.schema'
import { createCustomer } from '@/actions/customer.actions'
import { maskCpf, maskCnpj, maskPhone } from '@/lib/masks'
import { PHONE_COUNTRY_CODES } from '@/constants/phone-country-codes'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
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
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Separator } from '@genealogiq/ui/separator'
import { cn } from '@/lib/utils'

// Step titles/descriptions resolve from the Customers namespace at render time.
const STEP_KEYS = [
  { title: 'business',      desc: 'businessDesc'      },
  { title: 'contact',       desc: 'contactDesc'       },
  { title: 'address',       desc: 'addressDesc'       },
  { title: 'administrator', desc: 'administratorDesc' },
  { title: 'modules',       desc: 'modulesDesc'       },
] as const

type StepIndex = 0 | 1 | 2 | 3 | 4

const STEP_FIELDS: Record<StepIndex, (keyof CustomerCreateFormValues | string)[]> = {
  0: ['entityType', 'businessSegment', 'name', 'tradeName', 'taxId', 'stateRegistration', 'municipalRegistration', 'birthDate'],
  1: ['email', 'phoneCountryCode', 'phone'],
  2: [],
  3: ['owner.firstName', 'owner.lastName', 'owner.email'],
  4: [],
}

const ALWAYS_ACTIVE = ['dashboard', 'buySubscriptions', 'viewSubscriptions', 'customers', 'sales', 'system'] as const
const RECORDS_MODULES = [
  { name: 'moduleRecordsSuppliers', labelKey: 'suppliers' },
] as const
const CATEGORY_MODULES = [
  { name: 'moduleCategoriesSuppliers', labelKey: 'supplierCat' },
] as const

export function CustomerNewForm() {
  const t   = useTranslations('Customers')
  const tc  = useTranslations('Common')
  const tErr = useTranslations('Errors')
  const [step, setStep]                 = useState<StepIndex>(0)
  const [serverError, setServerError]   = useState<string | null>(null)
  const router = useRouter()

  const STEPS = STEP_KEYS.map((s) => ({ title: t(`sections.${s.title}`), desc: t(`steps.${s.desc}`) }))

  const form = useForm<CustomerCreateFormInput, unknown, CustomerCreateFormValues>({
    resolver:         useMemo(() => zodResolver(getCustomerCreateSchema(tErr)), [tErr]),
    defaultValues:    customerCreateDefaultValues,
    mode:             'onBlur',
    reValidateMode:   'onChange',
  })

  const { control, handleSubmit, setValue, trigger, formState: { isSubmitting, errors } } = form

  const entityType = useWatch({ control, name: 'entityType' })
  const isIndividual = entityType === 'INDIVIDUAL'

  async function goNext() {
    const fields = STEP_FIELDS[step]
    if (fields.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await trigger(fields as any)
      if (!ok) {
        fields.forEach((f) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form.setValue(f as any, form.getValues(f as any), { shouldTouch: true, shouldValidate: false })
        )
        return
      }
    }
    setStep((s) => (s + 1) as StepIndex)
  }

  function goBack() {
    setStep((s) => (s - 1) as StepIndex)
  }

  async function onSubmit(data: CustomerCreateFormValues) {
    setServerError(null)
    const result = await createCustomer(data)
    if (!result.ok) {
      setServerError(result.message)
    } else {
      if (result.message) toast.success(result.message)
      router.push('/customers')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-bold tracking-tight">
          {t('new')}
        </CardTitle>
      </CardHeader>
      <Separator />
      {/* The stepper lives inside the card with the fields it walks through,
          not above it — the card is the form, and the steps are part of it. */}
      <CardContent className="flex flex-col gap-6">

        {/* Stepper */}
        <nav aria-label={t('stepsNav')}>
          {/* Mobile: compact numbered steps */}
          <div className="flex items-center gap-2 md:hidden">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors',
                  i < step  && 'bg-primary text-primary-foreground',
                  i === step && 'ring-2 ring-primary bg-primary/10 text-primary',
                  i > step  && 'bg-muted text-muted-foreground',
                )}>
                  {i < step ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('h-px w-4 shrink-0', i < step ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            ))}
            <span className="ml-2 text-sm font-medium">{STEPS[step].title}</span>
            <span className="text-xs text-muted-foreground ml-1">— {STEPS[step].desc}</span>
          </div>

          {/* Desktop: full stepper */}
          <ol className="hidden md:flex items-start gap-0">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-start flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1">
                  <div className="flex items-center w-full">
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
                      i < step  && 'bg-primary text-primary-foreground',
                      i === step && 'ring-2 ring-primary ring-offset-2 bg-primary/10 text-primary',
                      i > step  && 'bg-muted text-muted-foreground',
                    )}>
                      {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={cn('h-px flex-1 mx-3 mt-0', i < step ? 'bg-primary' : 'bg-border')} />
                    )}
                  </div>
                  <div className="mt-2 pr-4">
                    <p className={cn('text-sm font-semibold', i === step ? 'text-foreground' : 'text-muted-foreground')}>{s.title}</p>
                    <p className="text-xs text-muted-foreground hidden lg:block">{s.desc}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </nav>

        {/* Step content */}
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">

          {/* ── Step 0: Business ── */}
          {step === 0 && (
            <div className="flex flex-col gap-6">
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
                        <FieldLabel>{t('fields.stateRegistrationShort')}</FieldLabel>
                        <Input {...field} value={field.value ?? ''} autoComplete="off" aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                    <Controller name="municipalRegistration" control={control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>{t('fields.municipalRegistrationShort')}</FieldLabel>
                        <Input {...field} value={field.value ?? ''} autoComplete="off" aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                  </div>
                )}
              </FieldGroup>
            </div>
          )}

          {/* ── Step 1: Contact ── */}
          {step === 1 && (
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
                        {PHONE_COUNTRY_CODES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
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
          )}

          {/* ── Step 2: Address ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t('hints.addressOptional')}</p>
              <AddressSection
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                control={control as any}
                setValue={setValue}
                errors={errors}
                prefix="address"
              />
            </div>
          )}

          {/* ── Step 3: Administrator ── */}
          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">{t('hints.admin')}</p>
              </div>
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Controller name="owner.firstName" control={control} render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>{t('owner.firstName')}</FieldLabel>
                      <Input {...field} autoComplete="given-name" aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )} />
                  <Controller name="owner.lastName" control={control} render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>{t('owner.lastName')}</FieldLabel>
                      <Input {...field} autoComplete="family-name" aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )} />
                </div>
                <Controller name="owner.email" control={control} render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>{t('owner.email')}</FieldLabel>
                    <Input {...field} type="email" autoComplete="off" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )} />
              </FieldGroup>
            </div>
          )}

          {/* ── Step 4: Modules ── */}
          {step === 4 && (
            <div className="flex flex-col gap-6">
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">{t('hints.modulesGray')}</p>
              </div>

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
            </div>
          )}

          {/* Server error */}
          {serverError && <FieldError>{serverError}</FieldError>}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button type="button" variant="outline" onClick={goBack} disabled={step === 0}>
              {tc('back')}
            </Button>

            <span className="text-xs text-muted-foreground">
              {t('stepOf', { step: step + 1, total: STEPS.length })}
            </span>

            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                {tc('next')}
              </Button>
            ) : (
              <Button type="button" onClick={() => handleSubmit(onSubmit)()} disabled={isSubmitting}>
                {isSubmitting ? tc('creating') : t('create')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
