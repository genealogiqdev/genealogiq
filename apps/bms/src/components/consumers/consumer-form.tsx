'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Gift, CheckCircle2 } from 'lucide-react'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Field, FieldLabel } from '@genealogiq/ui/field'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { Separator } from '@genealogiq/ui/separator'
import { registerConsumer, type ConsumerRegistrationResult } from '@/actions/consumer.actions'
import { getConsumerSchema } from '@/schemas/consumer.schema'
import type { CustomerCreateFormValues } from '@/schemas/customer.schema'
import { CustomerRegistrationSteps } from '@/components/customers/customer-registration-steps'
import { CustomerSegmentSelect } from '@/components/customers/customer-segment-select'
import { ConsumerResendButton } from './consumer-resend-button'

export function ConsumerForm({ initial, onPartnerSegmentChange }: {
  initial?: { firstName: string; lastName: string; email: string | null } | null
  onPartnerSegmentChange?: (segment: CustomerCreateFormValues['businessSegment']) => void
}) {
  const t = useTranslations('Consumers')
  const tCustomers = useTranslations('Customers')
  const tc = useTranslations('Common')
  const tErr = useTranslations('Errors')
  const schema = useMemo(() => getConsumerSchema(tErr), [tErr])
  const locale = useLocale()
  const router = useRouter()
  const requestId = useRef('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConsumerRegistrationResult | null>(null)
  const [message, setMessage] = useState('')
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState(0)
  const wizard = Boolean(onPartnerSegmentChange)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (wizard && step < 4) {
      const stepSchema = step === 0 ? schema.pick({ firstName: true, lastName: true })
        : step === 1 ? schema.pick({ email: true })
        : schema.pick({ notes: true })
      const parsed = stepSchema.safeParse({ firstName, lastName, email, notes })
      if (!parsed.success) { setError(parsed.error.issues[0].message); return }
      setStep(step + 1)
      return
    }
    requestId.current ||= crypto.randomUUID()
    startTransition(async () => {
      try {
        const response = await registerConsumer({ requestId: requestId.current, firstName, lastName, email, notes })
        if (!response.ok) { setError(response.message); return }
        setResult(response.data!)
        setMessage(response.message ?? '')
        router.refresh()
      } catch {
        setError(t('errors.connection'))
      }
    })
  }

  if (result) return (
    <Card><CardContent className="space-y-5 pt-6">
      <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden />
      <h2 className="text-xl font-semibold">{t('successTitle')}</h2>
      <p role="status" className={result.emailPending ? 'text-amber-700 dark:text-amber-400' : ''}>{message}</p>
      <p>{t('premiumUntil', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(result.expiresAt)) })}</p>
      <div className="flex flex-wrap gap-3">
        {result.emailPending && <ConsumerResendButton appUserId={result.appUserId} onSent={() => {
          setResult({ ...result, emailPending: false }); setMessage(t('emailSent'))
        }} />}
        <Button asChild variant="outline"><Link href="/consumers">{t('back')}</Link></Button>
        <Button onClick={() => {
          requestId.current = ''; setResult(null); setFirstName(''); setLastName(''); setEmail(''); setNotes(''); setStep(0)
        }}>{t('another')}</Button>
      </div>
    </CardContent></Card>
  )

  return (
    <Card>
      {wizard && <>
        <CardHeader><CardTitle className="text-2xl font-bold tracking-tight">{tCustomers('new')}</CardTitle></CardHeader>
        <Separator />
      </>}
      <CardContent className={wizard ? 'flex flex-col gap-6' : 'pt-6'}>
      {wizard && <CustomerRegistrationSteps step={step} consumer />}
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={pending} className="space-y-6">
          {wizard && step === 0 && <>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="consumer-type">{tCustomers('fields.type')}</FieldLabel>
                <Input id="consumer-type" value={tCustomers('entityType.individual')} readOnly />
              </Field>
              <CustomerSegmentSelect value="FINAL_CONSUMER" onValueChange={(value) => {
                if (value !== 'FINAL_CONSUMER') onPartnerSegmentChange?.(value)
              }} />
            </div>
            <p className="text-sm text-muted-foreground">{t('wizard.appOnly')}</p>
          </>}
          {(!wizard || step === 0) && <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="consumer-first-name">{t('firstName')}</FieldLabel>
              <Input id="consumer-first-name" autoComplete="given-name" required maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="consumer-last-name">{t('lastName')}</FieldLabel>
              <Input id="consumer-last-name" autoComplete="family-name" required maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>}
          {(!wizard || step === 1) && <Field>
            <FieldLabel htmlFor="consumer-email">{t('email')}</FieldLabel>
            <Input id="consumer-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-sm text-muted-foreground">{t('existingHint')}</p>
          </Field>}
          {(!wizard || step === 2) && <Field>
            <FieldLabel htmlFor="consumer-notes">{t('notes')}</FieldLabel>
            <Textarea id="consumer-notes" maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {wizard && <p className="text-sm text-muted-foreground">{t('wizard.purposeHint')}</p>}
          </Field>}
          {wizard && step === 3 && <div className="space-y-4">
            <p>{t('wizard.guardianHint')}</p>
            <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">{t('name')}</dt><dd className="break-words font-medium">{firstName.trim()} {lastName.trim()}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('email')}</dt><dd className="break-words font-medium">{email.trim().toLowerCase()}</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">{t('deliveryHint')}</p>
          </div>}
          {(!wizard || step === 4) && <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="font-semibold">{t('giftTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('giftDescription')}</p>
              <p className="text-sm text-muted-foreground">{t('deliveryHint')}</p>
              {wizard && <p className="text-sm text-muted-foreground">{t('wizard.premiumHint')}</p>}
            </div>
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {wizard ? <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-2">
            <Button type="button" variant="outline" disabled={step === 0 || pending} onClick={() => { setError(null); setStep(step - 1) }}>{tc('back')}</Button>
            <span className="text-xs text-muted-foreground">{tCustomers('stepOf', { step: step + 1, total: 5 })}</span>
            <Button type="submit" disabled={pending}>{step < 4 ? tc('next') : t(pending ? 'submitting' : 'submit')}</Button>
          </div> : <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>{t(pending ? 'submitting' : 'submit')}</Button>
            <Button asChild variant="outline"><Link href="/consumers">{t('cancel')}</Link></Button>
          </div>}
        </fieldset>
      </form>
    </CardContent></Card>
  )
}
