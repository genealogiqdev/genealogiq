import { Stack, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { appApi, type MemorialFromTreeView, type PlanTier } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { fullName } from '@/features/app/ProfileCards'
import { useRequireAppSession } from '@/features/app/session'
import { useErrorMessage, useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Avatar, Button, Card, EmptyState, Field, LoadingState, Muted, QueryView, Row, Screen, Segmented, Text, confirm, useNotify } from '@/ui'

type Candidate = MemorialFromTreeView['profiles'][number]
type Filter = 'all' | 'people' | 'pets'

/** Turn an existing tree member into a memorial under the signed-in guardian's care. */
export default function MemorialFromTree() {
  const user = useRequireAppSession()
  const t = useT('Memorialized')
  const router = useRouter()
  const notify = useNotify()
  const errorMessage = useErrorMessage()
  const invalidate = useInvalidate('app')
  const candidates = useView('app', ['memorialFromTree'], appApi.memorialFromTree, { enabled: !!user })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [quota, setQuota] = useState<{ limit: number; tier: PlanTier } | null>(null)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (candidates.data?.profiles ?? []).filter((profile) => {
      const pet = profile.role === 'APP_PET'
      if (filter === 'people' && pet) return false
      if (filter === 'pets' && !pet) return false
      return !needle || fullName(profile).toLowerCase().includes(needle)
    })
  }, [candidates.data, search, filter])

  if (!user) return <LoadingState />

  async function add(profile: Candidate, guardianId: string) {
    const name = fullName(profile)
    const confirmed = await confirm({
      title: t('fromTree.confirmTitle', { name }),
      message: t('fromTree.confirmDescription'),
      confirmLabel: t('fromTree.confirm'),
      cancelLabel: t('fromTree.cancel'),
    })
    if (!confirmed) return
    setBusy(profile.id)
    try {
      const result = await appApi.addMemorialFromTree(profile.id)
      if (!result.ok) {
        // A quota refusal carries the limit beside the message: explain it instead of a bare error.
        const refused = (result as { quota?: { limit: number; tier: PlanTier } }).quota
        if (refused) setQuota(refused)
        else notify.error(result.message)
        return
      }
      notify.success(result.data?.alreadyAdded ? t('fromTree.alreadyAdded') : t('fromTree.success'))
      await invalidate()
      router.replace(`/profile/${guardianId}/memorialized`)
    } catch (error) {
      notify.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen refreshing={candidates.isRefetching} onRefresh={() => void candidates.refetch()}>
      <Stack.Screen options={{ title: t('fromTree.title') }} />
      <QueryView query={candidates}>
        {(data) => (
          <>
            <Muted>{t('fromTree.description')}</Muted>
            <Card>
              <Muted>{t('fromTree.scopeHint')}</Muted>
              <Field label={t('fromTree.searchLabel')} value={search} onChangeText={setSearch} placeholder={t('fromTree.searchPlaceholder')} autoCorrect={false} />
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('fromTree.all') },
                  { value: 'people', label: t('fromTree.people') },
                  { value: 'pets', label: t('fromTree.pets') },
                ]}
              />
            </Card>
            {visible.length === 0 ? (
              <EmptyState
                icon="git-network-outline"
                title={data.profiles.length === 0 ? t('fromTree.empty') : t('fromTree.noResults')}
                action={data.profiles.length === 0 ? <Button label={t('fromTree.openTree')} variant="secondary" onPress={() => router.push(`/profile/${data.guardianId}/tree`)} /> : undefined}
              />
            ) : (
              visible.map((profile) => {
                const pet = profile.role === 'APP_PET'
                // Anyone who is not a tree-only (ghost) member is already under the guardian's care.
                const alreadyAdded = profile.role !== 'APP_GHOST'
                const years = [profile.birthDate, profile.deathDate].map((date) => (date ? new Date(date).getUTCFullYear() : null))
                const kind = pet ? profile.petSpecies || t('fromTree.pet') : t('fromTree.person')
                return (
                  <Card key={profile.id}>
                    <Row>
                      <Avatar uri={profile.avatarUrl} name={fullName(profile)} size={48} />
                      <View className="flex-1">
                        <Text className="font-semibold">{fullName(profile)}</Text>
                        <Muted>
                          {kind}
                          {years.some((year) => year !== null) ? ` · ${years[0] ?? '?'} – ${years[1] ?? '?'}` : ''}
                        </Muted>
                      </View>
                    </Row>
                    {alreadyAdded ? (
                      <Row className="justify-between">
                        <Muted className="flex-1">{t('fromTree.alreadyAdded')}</Muted>
                        <Button label={t('fromTree.viewProfile')} variant="secondary" size="sm" onPress={() => router.push(`/profile/${profile.id}`)} />
                      </Row>
                    ) : (
                      <Button
                        label={busy === profile.id ? t('fromTree.adding') : t('fromTree.add')}
                        loading={busy === profile.id}
                        disabled={busy !== null}
                        onPress={() => void add(profile, data.guardianId)}
                      />
                    )}
                  </Card>
                )
              })
            )}
            <LimitReachedSheet
              visible={quota !== null}
              onClose={() => setQuota(null)}
              context="memorials"
              limit={quota?.limit ?? 0}
              tier={quota?.tier ?? 'FREE'}
              returnPath={`/profile/${data.guardianId}/memorialized/from-tree`}
            />
          </>
        )}
      </QueryView>
    </Screen>
  )
}
