import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useT } from '@/i18n'
import { Button, Field } from '@/ui'
import { normalizeGenCode } from './scan-link'

/** Manual activation-code entry (web `/activate`): opens the code's landing screen. */
export function GenCodeEntry() {
  const t = useT('Qr')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const normalized = normalizeGenCode(code)
    if (normalized.length < 6) {
      setError(t('activateCode.invalid'))
      return
    }
    // The landing screen resolves the code and reports an unknown one itself.
    router.push(`/qr/${normalized}`)
  }

  return (
    <View className="gap-3">
      <Field
        label={t('activateCode.label')}
        value={code}
        onChangeText={(value) => {
          setCode(value)
          if (error) setError(null)
        }}
        placeholder={t('activateCode.placeholder')}
        error={error}
        required
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={t('activateCode.continue')} onPress={submit} fullWidth />
    </View>
  )
}
