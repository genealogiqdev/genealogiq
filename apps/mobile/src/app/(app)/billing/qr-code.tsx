import { Stack, useRouter } from 'expo-router'
import { appApi } from '@/api/app'
import { PlanGrid } from '@/features/app/PlanGrid'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, EmptyState, LoadingState, Muted, QueryView, Screen } from '@/ui'

/** The single entry paid plan that unlocks a QR Code, with a link to the full comparison. */
export default function BillingQrCode() {
  const user = useRequireAppSession()
  const t = useT('Qr')
  const router = useRouter()
  const invalidate = useInvalidate('app')
  const billing = useView('app', ['billingQrCode'], appApi.billingQrCode, { enabled: !!user })

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={billing.isRefetching} onRefresh={() => void billing.refetch()}>
      <Stack.Screen options={{ title: t('billing.title') }} />
      <Muted className="italic">{t('billing.subtitle')}</Muted>
      <QueryView query={billing}>
        {(data) =>
          data.entryPlan ? (
            <PlanGrid subscriptions={[data.entryPlan]} activePlan={data.activePlan} onChanged={() => invalidate(['billingQrCode'], ['subscriptions'], ['me'], ['qrCode'])} />
          ) : (
            <EmptyState icon="qr-code-outline" title={t('billing.noPackages')} />
          )
        }
      </QueryView>
      <Button label={t('billing.compareAllPlans')} variant="ghost" icon="arrow-forward" onPress={() => router.push('/subscriptions')} fullWidth />
    </Screen>
  )
}
