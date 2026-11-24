import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { bmsApi, type ConsumerRegistrationResult } from '@/api/bms'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { Button, Card, Field, Heading, Icon, Muted, Text, useAction } from '@/ui'
import { FormError, Note } from './fields'
import { useFormSubmit, useGo, useRules, uuid } from './lib'

interface Props {
  initial?: { firstName: string; lastName: string; email: string | null } | null
  /** Rendered above the fields (the partner wizard's type/segment selectors). */
  header?: ReactNode
}

/** Registers a final customer and grants the 12-month Premium gift (web: ConsumerForm). */
export function ConsumerForm({ initial, header }: Props) {
  const t = useT('Consumers')
  const tc = useT('Common')
  const rules = useRules()
  const go = useGo()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const resend = useAction()
  // One identifier per form instance: a retried submit can never grant twice.
  const requestId = useRef('')
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<ConsumerRegistrationResult | null>(null)
  const [message, setMessage] = useState('')

  function submit() {
    const invalid = form.invalid({
      firstName: rules.required(firstName) ?? rules.max(firstName.trim(), 100),
      lastName: rules.required(lastName) ?? rules.max(lastName.trim(), 100),
      email: rules.email(email) ?? rules.max(email.trim(), 320),
      notes: rules.max(notes.trim(), 500),
    })
    if (invalid) return
    requestId.current ||= uuid()
    void form.submit(
      () =>
        bmsApi.registerConsumer({
          requestId: requestId.current,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          notes: notes.trim(),
        }),
      async (response) => {
        if (response.data) setResult(response.data)
        setMessage(response.message ?? t('granted'))
        await invalidate(['consumers'], ['consumerNew'])
      },
    )
  }

  if (result) {
    return (
      <Card>
        <Icon name="checkmark-circle-outline" size={36} />
        <Heading>{t('successTitle')}</Heading>
        <Text accessibilityRole="alert">{message}</Text>
        <Muted>{t('premiumUntil', { date: formatDate(result.expiresAt, { utc: true, month: 'long' }) })}</Muted>
        <View className="gap-3 pt-2">
          {result.emailPending ? (
            <Button
              label={t('resend')}
              variant="secondary"
              icon="mail-outline"
              loading={resend.pending}
              onPress={() =>
                void resend.run(() => bmsApi.resendConsumerAccessEmail(result.appUserId), {
                  onSuccess: () => {
                    setResult({ ...result, emailPending: false })
                    setMessage(t('emailSent'))
                  },
                })
              }
            />
          ) : null}
          <Button label={t('back')} variant="outline" onPress={() => go.replace('/bms/customers', { segment: 'consumers' })} />
          <Button
            label={t('another')}
            onPress={() => {
              requestId.current = ''
              setResult(null)
              setFirstName('')
              setLastName('')
              setEmail('')
              setNotes('')
            }}
          />
        </View>
      </Card>
    )
  }

  return (
    <View className="gap-4">
      {header}
      <Card>
        <Heading>{t('giftTitle')}</Heading>
        <Muted>{t('giftDescription')}</Muted>
      </Card>
      <FormError message={form.error} />
      <Field label={t('firstName')} value={firstName} onChangeText={setFirstName} error={form.errors.firstName} maxLength={100} autoComplete="given-name" required />
      <Field label={t('lastName')} value={lastName} onChangeText={setLastName} error={form.errors.lastName} maxLength={100} autoComplete="family-name" required />
      <Field
        label={t('email')}
        value={email}
        onChangeText={setEmail}
        error={form.errors.email}
        hint={t('existingHint')}
        maxLength={320}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        required
      />
      <Field label={t('notes')} value={notes} onChangeText={setNotes} error={form.errors.notes} maxLength={500} multiline />
      <Note>{t('deliveryHint')}</Note>
      <Button label={form.pending ? t('submitting') : t('submit')} onPress={submit} loading={form.pending} fullWidth />
      <Button label={tc('cancel')} variant="ghost" onPress={go.back} disabled={form.pending} fullWidth />
    </View>
  )
}
