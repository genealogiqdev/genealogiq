'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Gift, CheckCircle2 } from 'lucide-react'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent } from '@genealogiq/ui/card'
import { Field, FieldLabel } from '@genealogiq/ui/field'
import { Input } from '@genealogiq/ui/input'
import { Textarea } from '@genealogiq/ui/textarea'
import { registerConsumer, type ConsumerRegistrationResult } from '@/actions/consumer.actions'
import { ConsumerResendButton } from './consumer-resend-button'

export function ConsumerForm({ initial }: { initial?: { firstName: string; lastName: string; email: string | null } | null }) {
  const t = useTranslations('Consumers')
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
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
          requestId.current = ''; setResult(null); setFirstName(''); setLastName(''); setEmail(''); setNotes('')
        }}>{t('another')}</Button>
      </div>
    </CardContent></Card>
  )

  return (
    <Card><CardContent className="pt-6">
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="consumer-first-name">{t('firstName')}</FieldLabel>
              <Input id="consumer-first-name" autoComplete="given-name" required maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="consumer-last-name">{t('lastName')}</FieldLabel>
              <Input id="consumer-last-name" autoComplete="family-name" required maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="consumer-email">{t('email')}</FieldLabel>
            <Input id="consumer-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-sm text-muted-foreground">{t('existingHint')}</p>
          </Field>
          <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="font-semibold">{t('giftTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('giftDescription')}</p>
              <p className="text-sm text-muted-foreground">{t('deliveryHint')}</p>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor="consumer-notes">{t('notes')}</FieldLabel>
            <Textarea id="consumer-notes" maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>{t(pending ? 'submitting' : 'submit')}</Button>
            <Button asChild variant="outline"><Link href="/consumers">{t('cancel')}</Link></Button>
          </div>
        </fieldset>
      </form>
    </CardContent></Card>
  )
}
