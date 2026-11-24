import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { appApi, appHttp, type AppRole } from '@/api/app'
import { http } from '@/api/client'
import { useAppUser } from '@/features/app/session'
import { ProfileList, type CardProfile } from '@/features/app/ProfileCards'
import { useRecentlyViewed } from '@/features/app/recent'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Card, Divider, EmptyState, ErrorState, Field, IconButton, LinkText, ListRow, Muted, QueryView, Screen, Section, Title } from '@/ui'

interface SearchResult {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: AppRole
  birthPlace: string | null
  birthCountry: string | null
  deathDate: string | null
  petSpecies: string | null
  petBreed: string | null
}

const MIN_QUERY = 3
const PREVIEW = 5

function useProfileSearch(term: string) {
  const [state, setState] = useState<{ results: SearchResult[] | null; loading: boolean; error: unknown }>({ results: null, loading: false, error: null })
  useEffect(() => {
    const query = term.trim()
    if (query.length < MIN_QUERY) {
      setState({ results: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    const timer = setTimeout(() => {
      http<SearchResult[]>('app', appHttp.search(query))
        .then((results) => {
          if (!cancelled) setState({ results, loading: false, error: null })
        })
        .catch((error: unknown) => {
          if (!cancelled) setState({ results: null, loading: false, error })
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])
  return state
}

function greetingKey(): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const hour = new Date().getHours()
  return hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening'
}

export default function Home() {
  const t = useT('Home')
  const tp = useT('Profile')
  const tm = useT('Mobile.app')
  const router = useRouter()
  const user = useAppUser()
  const home = useView('app', ['home'], appApi.home)
  const recent = useRecentlyViewed()
  const [term, setTerm] = useState('')
  const search = useProfileSearch(term)
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})

  const refetchRecent = recent.refetch
  useFocusEffect(
    useCallback(() => {
      void refetchRecent()
    }, [refetchRecent]),
  )

  const searching = term.trim().length >= MIN_QUERY
  const myProfile = user ? `/profile/${user.id}` : '/profile'

  const limited = (key: string, items: readonly CardProfile[]) => (showAll[key] ? items : items.slice(0, PREVIEW))
  const seeAll = (key: string, count: number) =>
    count > PREVIEW && !showAll[key] ? <LinkText label={t('seeAll')} onPress={() => setShowAll((current) => ({ ...current, [key]: true }))} /> : undefined

  return (
    <Screen refreshing={home.isRefetching} onRefresh={() => void home.refetch()}>
      <View className="gap-1">
        <Title>
          {t(greetingKey())}, {home.data?.firstName ?? user?.name.split(' ')[0] ?? t('greetingFallbackName')}
        </Title>
        <Muted>{t('tagline')}</Muted>
      </View>

      <Field
        value={term}
        onChangeText={setTerm}
        placeholder={t('searchPlaceholder')}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        accessibilityLabel={t('searchPlaceholder')}
        hint={term.trim().length > 0 && !searching ? tm('home.searchMinChars', { count: MIN_QUERY }) : undefined}
        right={term ? <IconButton icon="close-circle" label={t('clearSearch')} onPress={() => setTerm('')} size={20} /> : undefined}
      />

      {searching ? (
        search.error ? (
          <ErrorState error={search.error} />
        ) : search.loading || !search.results ? (
          <Muted className="py-6 text-center">{t('searching')}</Muted>
        ) : search.results.length === 0 ? (
          <EmptyState icon="search-outline" title={t('noProfilesFound')} />
        ) : (
          <ProfileList profiles={search.results} />
        )
      ) : (
        <>
          <Card>
            <ListRow icon="person-outline" title={t('myProfileTitle')} subtitle={t('myProfileSubtitle')} onPress={() => router.push(myProfile)} />
            <Divider />
            <ListRow icon="heart-outline" title={t('favoritesTitle')} subtitle={t('favoritesSubtitle')} onPress={() => router.push(`${myProfile}/favorites`)} />
            <Divider />
            <ListRow icon="flower-outline" title={t('guardedTitle')} subtitle={t('guardedSubtitle')} onPress={() => router.push(`${myProfile}/memorialized`)} />
            <Divider />
            <ListRow icon="scan-outline" title={tm('home.genealogyScan')} subtitle={tm('home.genealogyScanSubtitle')} onPress={() => router.push('/genealogy-scan')} />
          </Card>

          <Section title={t('recentlyViewedTitle')} action={seeAll('recent', recent.data?.length ?? 0)}>
            {recent.data && recent.data.length > 0 ? <ProfileList profiles={limited('recent', recent.data)} /> : <Muted>{t('recentlyViewedEmpty')}</Muted>}
          </Section>

          <QueryView query={home}>
            {(data) => {
              const favorites = data.favorites.map((favorite) => favorite.target)
              const memorials = data.memorials.filter((profile) => profile.role !== 'APP_PET')
              const pets = data.memorials.filter((profile) => profile.role === 'APP_PET')
              return (
                <>
                  <Section title={t('favoritesTitle')} action={seeAll('favorites', favorites.length)}>
                    {favorites.length > 0 ? <ProfileList profiles={limited('favorites', favorites)} /> : <Muted>{t('favoritesEmpty')}</Muted>}
                  </Section>
                  <Section
                    title={t('guardedTitle')}
                    action={memorials.length + pets.length > 0 ? <LinkText label={t('manageGuarded')} onPress={() => router.push(`${myProfile}/memorialized`)} /> : undefined}
                  >
                    {memorials.length > 0 ? <ProfileList profiles={limited('memorials', memorials)} /> : <Muted>{t('guardedEmpty')}</Muted>}
                    {seeAll('memorials', memorials.length)}
                  </Section>
                  <Section title={tp('petsTitle')} action={seeAll('pets', pets.length)}>
                    {pets.length > 0 ? <ProfileList profiles={limited('pets', pets)} /> : <Muted>{tp('emptyPets')}</Muted>}
                  </Section>
                </>
              )
            }}
          </QueryView>
        </>
      )}
    </Screen>
  )
}
