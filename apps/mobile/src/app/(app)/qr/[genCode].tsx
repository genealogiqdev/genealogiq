import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { useSession } from '@/auth/session'
import { MemorialForm } from '@/features/app/MemorialForm'
import { formatGenCode, normalizeGenCode } from '@/features/app/scan-link'
import { useAppUser } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, Heading, Icon, Muted, QueryView, Row, Screen, Text, Title } from '@/ui'

function CodeBadge({ code }: { code: string }) {
  const t = useT('Qr')
  return (
    <Card>
      <Row className="justify-between">
        <View className="flex-1">
          <Muted className="text-xs">{t('activateMemorial.activationCode')}</Muted>
          <Text className="text-lg font-semibold tracking-widest" selectable>
            {formatGenCode(code)}
          </Text>
        </View>
        <Badge label={t('activateMemorial.available')} color="success" />
      </Row>
    </Card>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View className="items-center gap-3 px-2 py-8">
      <Icon name="information-circle-outline" size={44} />
      <Title className="text-center">{title}</Title>
      <Text className="text-center">{body}</Text>
    </View>
  )
}

/** Public landing of a scanned or typed GenCode, in the four states of the web `/qr/[genCode]`. */
export default function GenCodeLanding() {
  const t = useT('Qr')
  const router = useRouter()
  const params = useLocalSearchParams<{ genCode: string }>()
  const code = normalizeGenCode(params.genCode ?? '')
  const user = useAppUser()
  const select = useSession((state) => state.select)
  const invalidate = useInvalidate('app')
  // Keyed by the viewer too: signing in changes which state the code is in.
  const landing = useView('app', ['qrLanding', code, user?.id ?? null], () => appApi.qrLanding(code))

  function authenticate(path: '/sign-in' | '/sign-up') {
    select('app')
    router.push({ pathname: path, params: { system: 'app', callbackUrl: `/qr/${code}` } })
  }

  return (
    <Screen refreshing={landing.isRefetching} onRefresh={() => void landing.refetch()}>
      <Stack.Screen options={{ title: t('landing.title') }} />
      <QueryView query={landing}>
        {(data) => {
          if (data.state === 'activated' && data.profileId) return <Redirect href={`/profile/${data.profileId}`} />
          if (data.state === 'soldToAnotherBuyer') return <Notice title={t('reseller.title')} body={t('reseller.body')} />
          if (data.state === 'expired' || data.state === 'activated') return <Notice title={t('expired.title')} body={t('expired.body')} />
          if (!data.authenticated || !user) {
            return (
              <>
                <View className="items-center gap-3 px-2 pt-6">
                  <Icon name="qr-code-outline" size={56} />
                  <Title className="text-center">{t('landing.title')}</Title>
                  <Muted className="text-center">{t('landing.description')}</Muted>
                </View>
                <CodeBadge code={data.genCode} />
                <Button label={t('landing.signIn')} onPress={() => authenticate('/sign-in')} fullWidth size="lg" />
                <Button label={t('landing.createAccount')} variant="secondary" onPress={() => authenticate('/sign-up')} fullWidth size="lg" />
              </>
            )
          }
          return (
            <>
              <View className="gap-1">
                <Heading className="text-xl">{t('activatePage.title')}</Heading>
                <Muted>{t('activatePage.subtitle')}</Muted>
              </View>
              <CodeBadge code={data.genCode} />
              <MemorialForm
                submitLabel={t('activateMemorial.activateAndCreate')}
                successMessage={t('activateMemorial.created')}
                submit={(payload) => appApi.activateGenCode(data.genCode, payload)}
                onCreated={async (id) => {
                  await invalidate()
                  router.replace(`/profile/${id}`)
                }}
              />
            </>
          )
        }}
      </QueryView>
    </Screen>
  )
}
