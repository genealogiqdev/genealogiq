import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useRequireAppSession } from '@/features/app/session'
import { QrExport } from '@/features/shared/QrExport'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, Card, Heading, Icon, LoadingState, Muted, QueryView, Screen } from '@/ui'

/** A profile's printable QR Code: the export tools when unlocked, the purchase path when not. */
export default function ProfileQrCode() {
  const user = useRequireAppSession()
  const t = useT('Qr')
  const ts = useT('Subscriptions')
  const tl = useT('LimitReached')
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const qr = useView('app', ['qrCode', id], () => appApi.qrCode(id), { enabled: !!user && !!id })
  const [limitOpen, setLimitOpen] = useState(false)

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={qr.isRefetching} onRefresh={() => void qr.refetch()}>
      <Stack.Screen options={{ title: t('profilePage.title') }} />
      <QueryView query={qr}>
        {(data) => {
          // Pet codes are exported from the pet's own profile.
          if (data.state === 'petProfile') return <Redirect href={`/profile/${data.profileId}`} />
          if (data.state === 'unlocked' && data.profileUrl) {
            return (
              <>
                <Muted className="italic">{t('profilePage.subtitle')}</Muted>
                <Card>
                  <QrExport value={data.profileUrl} fileName={`genealogiq-${data.profileId}`} />
                </Card>
              </>
            )
          }
          return (
            <>
              <Card>
                <View className="items-center gap-3 py-4">
                  <Icon name="lock-closed-outline" size={40} />
                  <Heading className="text-center">{ts('qrGate.title')}</Heading>
                  <Muted className="text-center">{data.memorialQr ? ts('qrGate.description') : t('profilePage.noQrYet')}</Muted>
                </View>
                <Button label={t('profilePage.purchase')} icon="qr-code-outline" onPress={() => router.push('/billing/qr-code')} fullWidth />
                <Button label={tl('cta.extraOnly')} variant="secondary" onPress={() => setLimitOpen(true)} fullWidth />
              </Card>
              <LimitReachedSheet
                visible={limitOpen}
                onClose={() => setLimitOpen(false)}
                context="qrCode"
                limit={data.limit ?? 0}
                tier={data.tier ?? 'FREE'}
                memorialQr={data.memorialQr}
                returnPath={`/profile/${id}/qr-code`}
              />
            </>
          )
        }}
      </QueryView>
    </Screen>
  )
}
