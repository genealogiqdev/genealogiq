import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { seqApi } from '@/api/seq'
import { useT } from '@/i18n'
import { Button, Field, Muted, Screen, useAction } from '@/ui'

export default function SeqFeedback() {
  const t = useT('Feedback')
  const te = useT('Errors')
  const router = useRouter()
  const params = useLocalSearchParams<{ type?: string }>()
  const type = params.type === 'bug' ? 'bug' : 'feedback'
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { run, pending } = useAction()

  async function send() {
    const body = message.trim()
    if (!body) {
      setError(te('required'))
      return
    }
    if (body.length > 2000) {
      setError(te('maxChars', { count: 2000 }))
      return
    }
    setError(null)
    await run(() => seqApi.sendFeedback({ type, message: body, page: 'mobile:/seq' }), {
      success: t(type === 'bug' ? 'toasts.bugSent' : 'toasts.feedbackSent'),
      onSuccess: () => router.back(),
    })
  }

  return (
    <>
      <Stack.Screen options={{ title: t(type === 'bug' ? 'dialog.bugTitle' : 'dialog.feedbackTitle') }} />
      <Screen footer={<Button label={t('submit')} icon="send-outline" onPress={() => void send()} loading={pending} fullWidth />}>
        <Muted>{t(type === 'bug' ? 'dialog.bugDescription' : 'dialog.feedbackDescription')}</Muted>
        <Field
          label={t('fields.message')}
          value={message}
          onChangeText={(value) => {
            setMessage(value)
            setError(null)
          }}
          placeholder={t('fields.messagePlaceholder')}
          multiline
          maxLength={2000}
          error={error}
          disabled={pending}
        />
      </Screen>
    </>
  )
}
