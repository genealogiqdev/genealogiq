import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { appApi } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { fullName, ProfileList } from '@/features/app/ProfileCards'
import { useAppUser } from '@/features/app/session'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, EmptyState, Muted, QueryView, Row, Screen, Segmented } from '@/ui'

type Sort = 'az' | 'za'

/** Pets of a person. Public like the web page; managers can add one within the plan's pet limit. */
export default function Pets() {
  const t = useT('Pets')
  const router = useRouter()
  const user = useAppUser()
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const pets = useView('app', ['pets', id, user?.id ?? null], () => appApi.pets(id), { enabled: !!id })
  const [sort, setSort] = useState<Sort>('az')
  const [limitOpen, setLimitOpen] = useState(false)

  const sorted = useMemo(() => {
    const items = [...(pets.data?.items ?? [])].sort((a, b) => fullName(a).localeCompare(fullName(b)))
    return sort === 'az' ? items : items.reverse()
  }, [pets.data, sort])

  return (
    <Screen refreshing={pets.isRefetching} onRefresh={() => void pets.refetch()}>
      <Stack.Screen options={{ title: t('listPage.title') }} />
      <QueryView query={pets}>
        {(data) => (
          <>
            <Row className="justify-between">
              <Muted className="flex-1 italic">{t('list.tagline')}</Muted>
              {data.items.length > 0 ? <Muted>{t('listPage.profileCount', { count: data.items.length })}</Muted> : null}
            </Row>
            {data.showCreate ? (
              <Button label={t('list.newProfile')} icon="add" onPress={() => (data.atLimit ? setLimitOpen(true) : router.push(`/profile/${id}/pets/new`))} fullWidth />
            ) : null}
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
            {data.items.length === 0 ? <EmptyState icon="paw-outline" title={data.canManage ? t('list.emptyOwn') : t('list.emptyGuarded')} /> : <ProfileList profiles={sorted} />}
            <LimitReachedSheet visible={limitOpen} onClose={() => setLimitOpen(false)} context="pets" limit={data.petsMax} tier={data.tier} returnPath={`/profile/${id}/pets`} />
          </>
        )}
      </QueryView>
    </Screen>
  )
}
