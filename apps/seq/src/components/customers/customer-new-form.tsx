'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CheckIcon } from 'lucide-react'
import {
  getAppUserSchema,
  appUserDefaultValues,
  type AppUserFormValues,
} from '@/schemas/app-user.schema'
import { createCustomer } from '@/actions/customer.actions'
import { maskPhone } from '@/lib/masks'
import { PHONE_COUNTRY_CODES } from '@/constants/phone-country-codes'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { MaskedInput } from '@genealogiq/ui/masked-input'
import { GenderSelect } from '@/components/ui/gender-select'
import { CountrySelect } from '@/components/ui/country-select'
import { AddressSection } from '@/components/address/address-section'
import { AddCustomerCategoryDialog } from '@/components/customer-categories/add-customer-category-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genealogiq/ui/select'
import { Field, FieldError, FieldGroup, FieldLabel } from '@genealogiq/ui/field'
import { cn } from '@/lib/utils'
import { CustomerOnboardingOptions } from './customer-onboarding-options'

interface Category { id: string; name: string }
interface Props { categories?: Category[]; canManageAccess?: boolean }

const SOCIAL_KEYS = ['fb', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'otherSocial', 'website'] as const
type SocialKey = typeof SOCIAL_KEYS[number]

function socialLabel(key: SocialKey, otherLabel: string): string {
  if (key === 'fb') return 'Facebook'
  if (key === 'x') return 'X'
  if (key === 'otherSocial') return otherLabel
  return key.charAt(0).toUpperCase() + key.slice(1)
}

const STEP_KEYS = ['personal', 'contact', 'address', 'access'] as const

type StepIndex = 0 | 1 | 2 | 3

const STEP_FIELDS: Record<StepIndex, (keyof AppUserFormValues)[]> = {
  0: ['firstName', 'lastName', 'birthDate'],
  1: ['email', 'phone'],
  2: [],
  3: [],
}

export function CustomerNewForm({ categories = [], canManageAccess = false }: Props) {
  const t  = useTranslations('Customers')
  const tc = useTranslations('Common')
  const tErr = useTranslations('Errors')
  const [step, setStep]               = useState<StepIndex>(0)
  const [localCats, setLocalCats]     = useState(categories)
  const [serverError, setServerError] = useState<string | null>(null)
  const [premium, setPremium] = useState(false)
  const [genCode, setGenCode] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const router = useRouter()

  const STEPS = STEP_KEYS.map((k) => ({
    title: t(`steps.${k}.title`),
    desc:  t(`steps.${k}.desc`),
  }))

  const form = useForm<AppUserFormValues>({
    resolver:       useMemo(() => zodResolver(getAppUserSchema(tErr)), [tErr]),
    defaultValues:  appUserDefaultValues,
    mode:           'onBlur',
    reValidateMode: 'onChange',
  })

  const { control, handleSubmit, setValue, trigger, formState: { isSubmitting, errors } } = form

  async function goNext() {
    const fields = STEP_FIELDS[step]
    if (fields.length > 0) {
      const ok = await trigger(fields)
      if (!ok) {
        fields.forEach((f) => form.setValue(f, form.getValues(f), { shouldTouch: true, shouldValidate: false }))
        return
      }
    }
    setStep((s) => (s + 1) as StepIndex)
  }

  function goBack() {
    setStep((s) => (s - 1) as StepIndex)
  }

  async function onSubmit(data: AppUserFormValues) {
    setServerError(null)
    const result = await createCustomer(data, premium ? { mode: 'gencode-premium', genCode, requestId } : { mode: 'registration' })
    if (!result.ok) {
      setServerError(result.message)
    } else {
      if (result.message) toast.success(result.message)
      router.push('/customers')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance">
        {t('new')}
      </h1>

      {/* Stepper */}
      <nav aria-label={t('stepsLabel')}>
        {/* Mobile: compact numbered steps */}
        <div className="flex items-center gap-2 md:hidden">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors',
                i < step   && 'bg-primary text-primary-foreground',
                i === step && 'ring-2 ring-primary bg-primary/10 text-primary',
                i > step   && 'bg-muted text-muted-foreground',
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
                    i < step   && 'bg-primary text-primary-foreground',
                    i === step && 'ring-2 ring-primary ring-offset-2 bg-primary/10 text-primary',
                    i > step   && 'bg-muted text-muted-foreground',
                  )}>
                    {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px flex-1 mx-3', i < step ? 'bg-primary' : 'bg-border')} />
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

      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">

        {/* ── Step 0: Personal ── */}
        {step === 0 && (
          <FieldGroup>
            <div className="grid grid-cols-12 gap-3">
              <Controller name="firstName" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-6" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.firstNameRequired')}</FieldLabel>
                  <Input {...field} autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
              <Controller name="lastName" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-6" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.lastNameRequired')}</FieldLabel>
                  <Input {...field} autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
            </div>

            <div className="grid grid-cols-12 gap-3">
              <Controller name="gender" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-6" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.gender')}</FieldLabel>
                  <GenderSelect value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
              <Controller name="birthDate" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-6" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.birthDateRequired')}</FieldLabel>
                  <Input {...field} value={field.value ?? ''} type="date" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
            </div>

            <div className="grid grid-cols-12 gap-3">
              <Controller name="birthCountry" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-4" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.birthCountry')}</FieldLabel>
                  <CountrySelect
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v)
                      setValue('address.country', v)
                    }}
                    invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
              <Controller name="birthState" control={control} render={({ field }) => (
                <Field className="col-span-4">
                  <FieldLabel>{t('fields.birthStateProvince')}</FieldLabel>
                  <Input {...field} value={field.value ?? ''} autoComplete="off" />
                </Field>
              )} />
              <Controller name="birthCity" control={control} render={({ field }) => (
                <Field className="col-span-4">
                  <FieldLabel>{t('fields.birthCity')}</FieldLabel>
                  <Input {...field} value={field.value ?? ''} autoComplete="off" />
                </Field>
              )} />
            </div>
          </FieldGroup>
        )}

        {/* ── Step 1: Contact ── */}
        {step === 1 && (
          <FieldGroup>
            <div className="grid grid-cols-12 gap-3">
              <Controller name="email" control={control} render={({ field, fieldState }) => (
                <Field className="col-span-6" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.emailRequired')}</FieldLabel>
                  <Input {...field} type="email" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
              <Controller name="phoneCountryCode" control={control} render={({ field }) => (
                <Field className="col-span-2">
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
                <Field className="col-span-4" data-invalid={fieldState.invalid}>
                  <FieldLabel>{t('fields.phoneRequired')}</FieldLabel>
                  <MaskedInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    maskFn={maskPhone}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )} />
            </div>

            <Controller name="categoryId" control={control} render={({ field }) => (
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>{t('fields.category')}</FieldLabel>
                  <AddCustomerCategoryDialog
                    onCreated={(cat) => {
                      setLocalCats((prev) => [...prev, cat])
                      field.onChange(cat.id)
                    }}
                  />
                </div>
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                  <SelectTrigger><SelectValue placeholder={t('placeholders.category')} /></SelectTrigger>
                  <SelectContent>
                    {localCats.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )} />

            <Controller name="notes" control={control} render={({ field }) => (
              <Field>
                <FieldLabel>{t('fields.notes')}</FieldLabel>
                <Textarea {...field} value={field.value ?? ''} rows={3} />
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

        {/* ── Step 3: App access and optional social links ── */}
        {step === 3 && (
          <FieldGroup>
            <CustomerOnboardingOptions email={form.getValues('email')} premium={premium} genCode={genCode}
              canManage={canManageAccess} onPremiumChange={setPremium} onGenCodeChange={setGenCode} />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">{t('steps.social.title')}</summary>
            <div className="grid grid-cols-12 gap-3">
              {SOCIAL_KEYS.map((key) => (
                <Controller key={key} name={key} control={control} render={({ field }) => (
                  <Field className="col-span-6 md:col-span-4">
                    <FieldLabel>{socialLabel(key, t('social.other'))}:</FieldLabel>
                    <Input {...field} value={field.value ?? ''} autoComplete="off" />
                  </Field>
                )} />
              ))}
            </div>
            </details>
          </FieldGroup>
        )}

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
              {isSubmitting ? tc('creating') : t('createCustomer')}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
