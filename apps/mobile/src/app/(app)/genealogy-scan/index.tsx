import { Stack, useRouter } from 'expo-router'
import { View } from 'react-native'
import { scanApi, type ScanAccess, type ScanStatus, type ScanSummary } from '@/api/scan'
import { useRequireAppSession } from '@/features/app/session'
import { StartScanForm } from '@/features/scan/StartScanForm'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, confirm, EmptyState, Heading, IconButton, LoadingState, Muted, QueryView, Screen, Section, Text, useAction } from '@/ui'

const STATUS_COLOR: Record<ScanStatus, 'accent' | 'success' | 'danger'> = { RUNNING: 'accent', COMPLETED: 'success', FAILED: 'danger' }

function AccessNotice({ access, runningId }: { access: ScanAccess; runningId: string | null }) {
  const t = useT('Mobile.scan')
  const router = useRouter()
  switch (access.denial) {
    case 'notConfigured':
      return <EmptyState icon="construct-outline" title={t('access.notConfigured.title')} description={t('access.notConfigured.body')} />
    case 'premiumRequired':
      return (
        <Card>
          <Heading>{t('access.premiumRequired.title')}</Heading>
          <Muted>{t('access.premiumRequired.body')}</Muted>
          <Button label={t('access.premiumRequired.cta')} icon="sparkles-outline" onPress={() => router.push('/subscriptions')} />
        </Card>
      )
    case 'monthlyLimitReached':
      return (
        <Card>
          <Heading>{t('access.monthlyLimitReached.title')}</Heading>
          <Muted>{t('access.monthlyLimitReached.body', { used: access.usedThisMonth, limit: access.monthlyLimit })}</Muted>
        </Card>
      )
    case 'scanInProgress':
      return (
        <Card>
          <Heading>{t('access.scanInProgress.title')}</Heading>
          <Muted>{t('access.scanInProgress.body')}</Muted>
          {runningId ? <Button label={t('access.scanInProgress.cta')} icon="git-network-outline" onPress={() => router.push(`/genealogy-scan/${runningId}`)} /> : null}
        </Card>
      )
    default:
      return null
  }
}

export default function GenealogyScans() {
  const user = useRequireAppSession()
  const t = useT('Mobile.scan')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const invalidate = useInvalidate('app')
  const { run } = useAction()
  const scans = useView('app', ['genealogyScans'], () => scanApi.list(), { enabled: !!user })

  async function remove(scan: ScanSummary) {
    const accepted = await confirm({
      title: t('list.deleteTitle', { surname: scan.surname }),
      message: scan.status === 'RUNNING' ? t('list.deleteRunningBody') : t('list.deleteBody'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await run(() => scanApi.remove(scan.id), { success: true })
    // Also after a failure: the scan may already be gone.
    await invalidate(['genealogyScans'], ['genealogyScan', scan.id])
  }

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={scans.isRefetching} onRefresh={() => void scans.refetch()}>
      <Stack.Screen options={{ title: t('title') }} />
      <Card>
        <Text>{t('intro.what')}</Text>
        <Text>{t('intro.limit')}</Text>
        <Muted>{t('intro.privacy')}</Muted>
      </Card>

      <QueryView query={scans}>
        {(data) => {
          const { access } = data
          const running = data.scans.find((scan) => scan.status === 'RUNNING') ?? null
          return (
            <>
              {access.configured && access.premium ? <Muted>{t('access.usage', { used: access.usedThisMonth, limit: access.monthlyLimit })}</Muted> : null}
              {access.canStart ? (
                <StartScanForm
                  onStarted={(id) => {
                    void invalidate(['genealogyScans'])
                    router.push(`/genealogy-scan/${id}`)
                  }}
                  onRefused={() => void scans.refetch()}
                />
              ) : (
                <AccessNotice access={access} runningId={running?.id ?? null} />
              )}

              <Section title={t('list.title')}>
                {data.scans.length === 0 ? <EmptyState icon="git-network-outline" title={t('list.empty')} /> : null}
                {data.scans.map((scan) => (
                  <Card key={scan.id} onPress={() => router.push(`/genealogy-scan/${scan.id}`)}>
                    <View className="flex-row items-center gap-3">
                      <View className="flex-1 gap-1">
                        <Heading>{scan.surname}</Heading>
                        <Muted>{formatDate(scan.createdAt)}</Muted>
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Badge label={t(`status.${scan.status}`)} color={STATUS_COLOR[scan.status]} />
                          <Muted>{t('list.nodes', { count: scan.nodeCount })}</Muted>
                        </View>
                      </View>
                      <IconButton icon="trash-outline" label={t('list.delete', { surname: scan.surname })} onPress={() => void remove(scan)} />
                    </View>
                  </Card>
                ))}
              </Section>
            </>
          )
        }}
      </QueryView>
    </Screen>
  )
}
