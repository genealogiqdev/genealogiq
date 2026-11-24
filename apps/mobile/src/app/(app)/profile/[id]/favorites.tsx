import { Stack, useLocalSearchParams } from 'expo-router'
import { appApi } from '@/api/app'
import { ProfileList } from '@/features/app/ProfileCards'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { EmptyState, IconButton, LoadingState, Muted, QueryView, Row, Screen, confirm, useAction } from '@/ui'
import { usePalette } from '@/theme'

export default function Favorites() {
  const user = useRequireAppSession()
  const t = useT('Favorites')
  const tp = useT('Profile')
  const tc = useT('Mobile.common')
  const palette = usePalette('app')
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const invalidate = useInvalidate('app')
  const { run } = useAction()
  const favorites = useView('app', ['favorites', id], () => appApi.favorites(id), { enabled: !!user && !!id })

  if (!user) return <LoadingState />

  async function remove(profileId: string, name: string) {
    const confirmed = await confirm({ title: tp('removeFromFavorites'), message: name, confirmLabel: tp('removeFromFavorites'), cancelLabel: tc('cancel'), destructive: true })
    if (!confirmed) return
    await run(() => appApi.toggleFavorite(profileId), { onSuccess: () => void invalidate(['favorites'], ['home'], ['profile']) })
  }

  return (
    <Screen refreshing={favorites.isRefetching} onRefresh={() => void favorites.refetch()}>
      <Stack.Screen options={{ title: favorites.data ? t('title', { name: favorites.data.profile.firstName }) : tp('favoritesTitle') }} />
      <QueryView query={favorites}>
        {(data) => (
          <>
            <Row className="justify-between">
              <Muted className="flex-1 italic">{t('subtitle')}</Muted>
              {data.items.length > 0 ? <Muted>{t('profileCount', { count: data.items.length })}</Muted> : null}
            </Row>
            {data.items.length === 0 ? (
              <EmptyState icon="heart-outline" title={t('empty')} />
            ) : (
              <ProfileList
                profiles={data.items.map((item) => item.target)}
                renderRight={
                  data.isOwner
                    ? (profile) => (
                        <IconButton icon="heart" color={palette.danger} label={tp('removeFromFavorites')} onPress={() => void remove(profile.id, [profile.firstName, profile.lastName].filter(Boolean).join(' '))} />
                      )
                    : undefined
                }
              />
            )}
          </>
        )}
      </QueryView>
    </Screen>
  )
}
