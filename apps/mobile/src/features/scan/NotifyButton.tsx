import { useState } from 'react'
import { Platform, View } from 'react-native'
import { useT } from '@/i18n'
import { Button, Muted, useNotify } from '@/ui'
import { registerForPush } from './push'

/**
 * Offers to turn on the app's notifications. Registration happens only on
 * this tap, never automatically. The wording does not promise an alert for
 * this scan: the server does not send one yet.
 */
export function NotifyButton({ compact }: { compact?: boolean }) {
  const t = useT('Mobile.scan')
  const tc = useT('Mobile.common')
  const notify = useNotify()
  const [state, setState] = useState<'idle' | 'pending' | 'on'>('idle')

  if (Platform.OS === 'web') return null

  async function enable() {
    setState('pending')
    const result = await registerForPush(t('notify.channel'))
    if (result.token !== null) {
      setState('on')
      notify.success(t('notify.enabled'))
      return
    }
    setState('idle')
    if (result.reason === 'denied') notify.info(tc('permissionDenied'))
    else notify.info(t(result.reason === 'unsupported' ? 'notify.unsupported' : 'notify.unavailable'))
  }

  if (state === 'on') return <Muted className={compact ? '' : 'text-center'}>{t('notify.enabled')}</Muted>
  return (
    <View className={compact ? 'gap-1' : 'items-center gap-2'}>
      <Button label={t('notify.button')} icon="notifications-outline" variant="secondary" size={compact ? 'sm' : 'md'} onPress={() => void enable()} loading={state === 'pending'} />
      {compact ? null : <Muted className="text-center">{t('notify.hint')}</Muted>}
    </View>
  )
}
