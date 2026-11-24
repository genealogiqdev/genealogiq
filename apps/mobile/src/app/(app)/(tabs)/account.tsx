import { useRouter } from 'expo-router'
import { useState } from 'react'
import { appApi } from '@/api/app'
import { API_ORIGINS, type Locale } from '@/config'
import { AccountPanel } from '@/features/account/AccountPanel'
import { ChangeEmailSheet, ChangePasswordSheet, DeleteAccountSheet, FeedbackSheet } from '@/features/app/AccountForms'
import { useAppUser } from '@/features/app/session'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { openInBrowser } from '@/lib/share'
import { Badge, Card, Divider, ErrorState, ListRow, Muted, Screen, useNotify } from '@/ui'

type OpenSheet = 'password' | 'email' | 'delete' | 'feedback' | null

export default function Account() {
  const t = useT('Auth')
  const tn = useT('Nav')
  const tf = useT('Feedback')
  const tm = useT('Mobile.app')
  const te = useT('Memorialized')
  const router = useRouter()
  const notify = useNotify()
  const user = useAppUser()
  const me = useView('app', ['me'], appApi.me)
  const [sheet, setSheet] = useState<OpenSheet>(null)

  // Mobile sign-in is by password, so the forms below normally apply; the flag covers accounts created with Google on the web.
  const hasPassword = me.data?.user.hasPassword ?? true
  const plan = me.data?.plan

  function persistLocale(locale: Locale) {
    appApi
      .updatePreferredLocale(locale)
      .then((result) => {
        if (!result.ok) notify.error(result.message)
      })
      .catch((error: unknown) => notify.error(error))
  }

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <AccountPanel system="app" onLocaleChange={persistLocale} />

      {me.isError && !me.data ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}

      <Card>
        <ListRow icon="person-outline" title={tn('myProfile')} onPress={() => router.push(user ? `/profile/${user.id}` : '/profile')} />
        <Divider />
        <ListRow icon="create-outline" title={te('editPage.title')} subtitle={te('editPage.subtitleLiving')} onPress={() => router.push(user ? `/profile/${user.id}/edit` : '/profile')} />
        <Divider />
        <ListRow
          icon="sparkles-outline"
          title={tn('subscriptions')}
          subtitle={plan?.active ? plan.active.subscription.name : undefined}
          right={plan ? <Badge label={plan.active?.subscription.name ?? plan.code} color="accent" /> : undefined}
          onPress={() => router.push('/subscriptions')}
        />
      </Card>

      <Card>
        {hasPassword ? (
          <>
            <ListRow icon="key-outline" title={t('changePasswordTrigger')} onPress={() => setSheet('password')} />
            <Divider />
            <ListRow icon="mail-outline" title={t('changeEmailTrigger')} subtitle={me.data?.user.email ?? user?.email} onPress={() => setSheet('email')} />
          </>
        ) : (
          <Muted>{tm('account.noPassword')}</Muted>
        )}
      </Card>

      <Card>
        <ListRow icon="chatbubble-ellipses-outline" title={tf('links.contact')} subtitle={tf('links.reportBug')} onPress={() => setSheet('feedback')} />
        <Divider />
        <ListRow icon="document-text-outline" title={tf('footer.terms')} onPress={() => void openInBrowser(`${API_ORIGINS.app}/terms`).catch((error: unknown) => notify.error(error))} />
      </Card>

      {hasPassword ? (
        <Card>
          <ListRow icon="trash-outline" title={t('deleteAccountTrigger')} subtitle={tm('account.deleteHint')} destructive onPress={() => setSheet('delete')} />
        </Card>
      ) : null}

      <ChangePasswordSheet visible={sheet === 'password'} onClose={() => setSheet(null)} />
      <ChangeEmailSheet visible={sheet === 'email'} onClose={() => setSheet(null)} />
      <DeleteAccountSheet visible={sheet === 'delete'} onClose={() => setSheet(null)} />
      <FeedbackSheet visible={sheet === 'feedback'} onClose={() => setSheet(null)} />
    </Screen>
  )
}
