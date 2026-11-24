import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import type { ActionResponse } from '@/api/client'
import { seqApi, type MeView } from '@/api/seq'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { DateField, Field, SelectField, SwitchRow, Text, useNotify, type Option } from '@/ui'
import { localizedCountries } from './countries'
import { EMAIL, type FormValues } from './util'

/** Capability flags for the signed-in staff member. Never an authorization: the server re-checks. */
export function useMe() {
  return useView<MeView>('seq', ['me'], () => seqApi.me())
}

export type FieldKind = 'text' | 'email' | 'phone' | 'number' | 'decimal' | 'multiline' | 'date' | 'select' | 'switch' | 'country' | 'code'

export interface Spec {
  key: string
  label: string
  kind?: FieldKind
  required?: boolean
  /** Message used instead of the generic "required" one. */
  requiredMessage?: string
  min?: number
  max?: number
  email?: boolean
  options?: readonly Option[]
  placeholder?: string
  hint?: string
  mask?: (value: string) => string
  clearLabel?: string
}

export type Errors = Record<string, string | undefined>

export interface FormApi {
  values: FormValues
  errors: Errors
  pending: boolean
  set: (key: string, value: string | boolean) => void
  reset: (values: FormValues) => void
  setErrors: (errors: Errors) => void
  /** Client-side validation mirroring the web Zod schema. Returns true when clean. */
  validate: (specs: readonly Spec[], extra?: (values: FormValues) => Errors) => boolean
  /** Runs an action, surfacing its message as a toast and its fieldErrors on the fields. */
  submit: <T>(
    call: () => Promise<ActionResponse<T>>,
    options?: { success?: string | true; onSuccess?: (response: ActionResponse<T> & { ok: true }) => void | Promise<void> },
  ) => Promise<boolean>
}

export function useForm(initial: FormValues): FormApi {
  const te = useT('Errors')
  const notify = useNotify()
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)

  return {
    values,
    errors,
    pending,
    set(key, value) {
      setValues((current) => ({ ...current, [key]: value }))
      setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
    },
    reset(next) {
      setValues(next)
      setErrors({})
    },
    setErrors,
    validate(specs, extra) {
      const next: Errors = {}
      for (const spec of specs) {
        if (spec.kind === 'switch') continue
        const value = String(values[spec.key] ?? '').trim()
        if (!value) {
          if (spec.required) next[spec.key] = spec.requiredMessage ?? te('required')
          continue
        }
        if (spec.min && value.length < spec.min) next[spec.key] = te('minChars', { count: spec.min })
        else if (spec.max && value.length > spec.max) next[spec.key] = te('maxChars', { count: spec.max })
        else if ((spec.email || spec.kind === 'email') && !EMAIL.test(value)) next[spec.key] = te('invalidEmail')
      }
      Object.assign(next, extra?.(values))
      setErrors(next)
      return !Object.values(next).some(Boolean)
    },
    async submit(call, options = {}) {
      setPending(true)
      try {
        const response = await call()
        if (!response.ok) {
          const server: Errors = {}
          for (const [key, list] of Object.entries(response.fieldErrors ?? {})) {
            if (list?.[0]) server[key] = list[0]
          }
          if (Object.keys(server).length > 0) setErrors(server)
          notify.error(response.message || te('description'))
          return false
        }
        const message = options.success === true ? response.message : options.success
        if (message) notify.success(message)
        await options.onSuccess?.(response)
        return true
      } catch (error) {
        notify.error(error)
        return false
      } finally {
        setPending(false)
      }
    },
  }
}

/** Renders a list of field specs against a form. */
export function FormFields({ specs, form, disabled }: { specs: readonly Spec[]; form: FormApi; disabled?: boolean }) {
  const countries = useMemo(() => localizedCountries(), [])
  const off = disabled || form.pending
  return (
    <View className="gap-4">
      {specs.map((spec) => {
        const value = form.values[spec.key]
        const error = form.errors[spec.key]
        const label = spec.required && !/\*\s*$/.test(spec.label) ? `${spec.label} *` : spec.label
        switch (spec.kind) {
          case 'switch':
            return <SwitchRow key={spec.key} label={spec.label} description={spec.hint} value={value === true} onChange={(next) => form.set(spec.key, next)} disabled={off} />
          case 'date':
            return <DateField key={spec.key} label={label} value={String(value ?? '')} onChange={(next) => form.set(spec.key, next)} error={error} />
          case 'select':
          case 'country':
            return (
              <SelectField
                key={spec.key}
                label={label}
                value={String(value ?? '') || null}
                options={spec.kind === 'country' ? countries : (spec.options ?? [])}
                onChange={(next) => form.set(spec.key, next)}
                placeholder={spec.placeholder}
                error={error}
                searchable={spec.kind === 'country'}
                disabled={off}
                clearLabel={spec.clearLabel}
                onClear={spec.clearLabel ? () => form.set(spec.key, '') : undefined}
              />
            )
          default:
            return (
              <Field
                key={spec.key}
                label={label}
                value={String(value ?? '')}
                onChangeText={(next) => form.set(spec.key, spec.mask ? spec.mask(next) : spec.kind === 'code' ? next.toUpperCase() : spec.kind === 'phone' ? next.replace(/\D/g, '') : next)}
                error={error}
                hint={spec.hint}
                placeholder={spec.placeholder}
                disabled={off}
                multiline={spec.kind === 'multiline'}
                maxLength={spec.max}
                keyboardType={
                  spec.kind === 'email' ? 'email-address' : spec.kind === 'phone' ? 'phone-pad' : spec.kind === 'number' ? 'number-pad' : spec.kind === 'decimal' ? 'decimal-pad' : 'default'
                }
                autoCapitalize={spec.kind === 'email' ? 'none' : spec.kind === 'code' ? 'characters' : undefined}
                autoCorrect={spec.kind === 'email' || spec.kind === 'code' ? false : undefined}
              />
            )
        }
      })}
    </View>
  )
}

/** The shared address block (web: AddressSection). The ZIP lookup is web-only. */
export function useAddressSpecs(): Spec[] {
  const t = useT('Common.address')
  return [
    { key: 'address.country', label: t('country'), kind: 'country', placeholder: t('selectPlaceholder') },
    { key: 'address.zip', label: t('zipCode'), max: 20 },
    { key: 'address.street', label: t('street'), max: 200 },
    { key: 'address.number', label: t('number'), max: 20 },
    { key: 'address.complement', label: t('complement'), max: 200 },
    { key: 'address.neighborhood', label: t('neighborhood'), max: 200 },
    { key: 'address.city', label: t('city'), max: 200 },
    { key: 'address.state', label: t('state'), max: 200 },
  ]
}

export function Notice({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <View className={tone === 'danger' ? 'rounded-xl border border-danger p-3' : 'rounded-xl bg-default p-3'} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Text className={tone === 'danger' ? 'text-sm text-danger' : 'text-sm'}>{children}</Text>
    </View>
  )
}
