import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type FeedbackInput } from '@/api/bms'
import { FormError } from '@/features/bms/fields'
import { useFormSubmit, useGo, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { Button, Field, Muted, Screen, Segmented, useNotify } from '@/ui'

export default function Feedback() {
  const t = useT('Feedback')
  const tc = useT('Common')
  const params = useLocalSearchParams<{ type?: string }>()
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const form = useFormSubmit()
  const [type, setType] = useState<FeedbackInput['type']>(params.type === 'bug' ? 'bug' : 'feedback')
  const [message, setMessage] = useState('')
  const bug = type === 'bug'

  function send() {
    if (form.invalid({ message: rules.required(message) ?? rules.max(message.trim(), 2000) })) return
    void form.submit(
      () => bmsApi.sendFeedback({ type, message: message.trim(), page: 'mobile:/bms/feedback' }),
      () => {
        notify.success(bug ? t('toasts.bugSent') : t('toasts.feedbackSent'))
        go.back()
      },
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: bug ? t('dialog.bugTitle') : t('dialog.feedbackTitle') }} />
      <Screen>
        <Segmented<FeedbackInput['type']>
          value={type}
          onChange={setType}
          options={[
            { value: 'feedback', label: t('links.sendFeedback') },
            { value: 'bug', label: t('links.reportBug') },
          ]}
        />
        <Muted>{bug ? t('dialog.bugDescription') : t('dialog.feedbackDescription')}</Muted>
        <FormError message={form.error} />
        <Field label={t('fields.message')} value={message} onChangeText={setMessage} placeholder={t('fields.messagePlaceholder')} error={form.errors.message} maxLength={2000} multiline />
        <Button label={t('submit')} icon="send-outline" onPress={send} loading={form.pending} fullWidth />
        <Button label={tc('cancel')} variant="ghost" onPress={go.back} disabled={form.pending} fullWidth />
      </Screen>
    </>
  )
}
