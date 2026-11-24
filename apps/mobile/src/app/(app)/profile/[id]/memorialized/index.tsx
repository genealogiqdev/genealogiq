import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { appApi } from '@/api/app'
import { LimitReachedSheet, type LimitReachedContext } from '@/features/app/LimitReached'
import { fullName, ProfileList } from '@/features/app/ProfileCards'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, Card, Divider, EmptyState, ListRow, LoadingState, Muted, QueryView, Row, Screen, Segmented, Sheet } from '@/ui'

type Sort = 'az' | 'za'

/** Memorials and pets a person cares for; the owner can add more within the plan's limits. */
export default function Memorialized() {
  const user = useRequireAppSession()
  const t = useT('Memorialized')
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const list = useView('app', ['memorialized', id], () => appApi.memorialized(id), { enabled: !!user && !!id })
  const [sort, setSort] = useState<Sort>('az')
  const [adding, setAdding] = useState(false)
  const [limit, setLimit] = useState<LimitReachedContext | null>(null)

  const sorted = useMemo(() => {
    const items = [...(list.data?.items ?? [])].sort((a, b) => fullName(a).localeCompare(fullName(b)))
    return sort === 'az' ? items : items.reverse()
  }, [list.data, sort])

  if (!user) return <LoadingState />

  const base = `/profile/${id}`
  const go = (path: string) => {
    setAdding(false)
    router.push(path)
  }
  const gated = (atLimit: boolean, context: LimitReachedContext, path: string) => () => {
    setAdding(false)
    if (atLimit) setLimit(context)
    else router.push(path)
  }

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <Stack.Screen options={{ title: t('listPage.title') }} />
      <QueryView query={list}>
        {(data) => (
          <>
            <Row className="justify-between">
              <Muted className="flex-1 italic">{t('list.tagline')}</Muted>
              {data.items.length > 0 ? <Muted>{t('listPage.profileCount', { count: data.items.length })}</Muted> : null}
            </Row>
            {data.showCreate ? <Button label={t('list.new')} icon="add" onPress={() => setAdding(true)} fullWidth /> : null}
            {data.items.length > 1 ? (
              <Segmented<Sort>
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'az', label: t('list.sortAsc') },
                  { value: 'za', label: t('list.sortDesc') },
                ]}
              />
            ) : null}
            {data.items.length === 0 ? <EmptyState icon="flower-outline" title={data.isOwner ? t('list.emptyOwn') : t('list.emptyGuarded')} /> : <ProfileList profiles={sorted} />}

            <Sheet visible={adding} onClose={() => setAdding(false)} title={t('list.new')}>
              <Card>
                <ListRow icon="git-network-outline" title={t('list.fromTree')} onPress={() => go(`${base}/memorialized/from-tree`)} />
                <Divider />
                <ListRow icon="flower-outline" title={t('list.newPerson')} onPress={gated(data.atLimit, 'memorials', `${base}/memorialized/new`)} />
                <Divider />
                <ListRow icon="paw-outline" title={t('list.newPet')} onPress={gated(data.petAtLimit, 'pets', `${base}/pets/new`)} />
              </Card>
            </Sheet>
            <LimitReachedSheet
              visible={limit !== null}
              onClose={() => setLimit(null)}
              context={limit ?? 'memorials'}
              limit={limit === 'pets' ? data.petsMax : data.memorialsMax}
              tier={data.tier}
              returnPath={`${base}/memorialized`}
            />
          </>
        )}
      </QueryView>
    </Screen>
  )
}
