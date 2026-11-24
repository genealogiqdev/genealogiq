import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { appApi } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { MemorialForm } from '@/features/app/MemorialForm'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, EmptyState, LoadingState, Muted, QueryView, Screen } from '@/ui'

/** Create a memorial for the signed-in guardian, or explain the plan limit when it is reached. */
export default function NewMemorial() {
  const user = useRequireAppSession()
  const t = useT('Memorialized')
  const tl = useT('LimitReached')
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const invalidate = useInvalidate('app')
  const status = useView('app', ['memorialNew'], appApi.memorialNew, { enabled: !!user })
  const [limitOpen, setLimitOpen] = useState(false)

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={status.isRefetching} onRefresh={() => void status.refetch()}>
      <Stack.Screen options={{ title: t('newPage.title') }} />
      <QueryView query={status}>
        {(data) =>
          data.allowed ? (
            <>
              <Muted>{t('newPage.subtitle')}</Muted>
              <MemorialForm
                submitLabel={t('actions.createProfile')}
                successMessage={t('toasts.created')}
                submit={appApi.createMemorial}
                onCreated={async (id) => {
                  await invalidate()
                  router.replace(`/profile/${id}`)
                }}
              />
            </>
          ) : (
            <>
              <EmptyState
                icon="flower-outline"
                title={tl('title.memorials')}
                description={tl('description.memorials', { limit: data.limit })}
                action={<Button label={tl(data.tier === 'FREE' ? 'cta.upgrade' : 'cta.extraOnly')} onPress={() => setLimitOpen(true)} />}
              />
              <LimitReachedSheet
                visible={limitOpen}
                onClose={() => setLimitOpen(false)}
                context="memorials"
                limit={data.limit}
                tier={data.tier}
                returnPath={`/profile/${params.id ?? user.id}/memorialized/new`}
              />
            </>
          )
        }
      </QueryView>
    </Screen>
  )
}
