import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Spinner } from 'heroui-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, View } from 'react-native'
import { ApiError } from '@/api/client'
import { scanApi } from '@/api/scan'
import { useRequireAppSession } from '@/features/app/session'
import { NotifyButton } from '@/features/scan/NotifyButton'
import { ScanGraphView } from '@/features/scan/ScanGraphView'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, EmptyState, ErrorState, Heading, LinkText, LoadingState, Muted, Screen } from '@/ui'

const POLL_MS = 6000
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** True only while this screen is the focused one and the app is in the foreground. */
function useWatching(): boolean {
  const [focused, setFocused] = useState(false)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'))
    return () => subscription.remove()
  }, [])
  return focused && foreground
}

export default function GenealogyScanDetail() {
  const user = useRequireAppSession()
  const t = useT('Mobile.scan')
  const router = useRouter()
  const invalidate = useInvalidate('app')
  const id = first(useLocalSearchParams<{ id?: string | string[] }>().id) ?? ''
  const watching = useWatching()

  // Each read makes the server pull the newest graph from the research
  // session, so polling is what moves a running scan forward. It stops once
  // the scan is over, when the screen loses focus and when the app is backgrounded.
  const scan = useView('app', ['genealogyScan', id], () => scanApi.detail(id), {
    enabled: !!user && !!id,
    staleTime: 0,
    refetchInterval: (query) => (watching && query.state.data?.status === 'RUNNING' ? POLL_MS : false),
    refetchIntervalInBackground: false,
  })

  const status = scan.data?.status
  const refetch = scan.refetch
  // Coming back to a running scan: catch up at once instead of waiting a full interval.
  const wasWatching = useRef(watching)
  useEffect(() => {
    if (watching && !wasWatching.current && status === 'RUNNING') void refetch()
    wasWatching.current = watching
  }, [watching, status, refetch])

  // The list shows status and node counts: refresh it when this scan finishes.
  const lastStatus = useRef(status)
  useEffect(() => {
    if (lastStatus.current === 'RUNNING' && status && status !== 'RUNNING') void invalidate(['genealogyScans'])
    lastStatus.current = status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (!user) return <LoadingState />

  const backToForm = () => router.replace('/genealogy-scan')
  const title = <Stack.Screen options={{ title: scan.data?.surname || t('title') }} />

  if (scan.data === undefined) {
    if (scan.error instanceof ApiError && scan.error.status === 404) {
      return (
        <Screen>
          {title}
          <EmptyState icon="search-outline" title={t('detail.notFound.title')} description={t('detail.notFound.body')} action={<Button label={t('detail.notFound.cta')} onPress={backToForm} />} />
        </Screen>
      )
    }
    // 401 signs the user out (the guard above redirects); 403, network and server errors are explained here.
    return (
      <>
        {title}
        {scan.isError ? <ErrorState error={scan.error} onRetry={() => void scan.refetch()} /> : <LoadingState />}
      </>
    )
  }

  const data = scan.data
  if (!data.graph) {
    return (
      <Screen>
        {title}
        {data.status === 'RUNNING' ? (
          <View className="items-center gap-4 px-4 py-12">
            <Spinner size="lg" />
            <Heading className="text-center" accessibilityLiveRegion="polite">
              {t('detail.running.title', { surname: data.surname })}
            </Heading>
            <Muted className="text-center">{t('detail.running.body')}</Muted>
            <NotifyButton />
          </View>
        ) : data.status === 'FAILED' ? (
          <EmptyState icon="alert-circle-outline" title={t('detail.failed.title')} description={t('detail.failed.body')} action={<Button label={t('detail.failed.cta')} onPress={backToForm} />} />
        ) : (
          <EmptyState icon="git-network-outline" title={t('detail.empty.title')} description={t('detail.empty.body')} action={<Button label={t('detail.failed.cta')} onPress={backToForm} />} />
        )}
      </Screen>
    )
  }

  const banner =
    data.status === 'RUNNING' ? (
      <View className="flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Spinner size="sm" />
        <Muted className="flex-1" accessibilityLiveRegion="polite">
          {t('detail.running.banner', { count: data.graph.nodes.length })}
        </Muted>
        <NotifyButton compact />
      </View>
    ) : data.status === 'FAILED' ? (
      <View className="flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Muted className="flex-1">{t('detail.failed.partial')}</Muted>
        <LinkText label={t('detail.failed.cta')} onPress={backToForm} />
      </View>
    ) : null

  return <ScanGraphView graph={data.graph} userId={user.id} banner={banner} />
}
