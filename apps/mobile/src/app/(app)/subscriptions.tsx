import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { appApi } from '@/api/app'
import { ManageBillingButton, PlanGrid, useActivePlanLine } from '@/features/app/PlanGrid'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { EmptyState, LoadingState, Muted, QueryView, Screen, Text, useNotify } from '@/ui'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function Subscriptions() {
  const user = useRequireAppSession()
  const t = useT('Subscriptions')
  const router = useRouter()
  const notify = useNotify()
  const invalidate = useInvalidate('app')
  const planLine = useActivePlanLine()
  const params = useLocalSearchParams<{ status?: string; session_id?: string }>()

  // A Stripe return link (`/subscriptions?status=success&session_id=…`) asks the
  // server to mirror that checkout before the plan is read.
  const rawStatus = first(params.status)
  const status = rawStatus === 'success' || rawStatus === 'cancel' ? rawStatus : undefined
  const sessionId = status === 'success' ? first(params.session_id) : undefined

  const plans = useView('app', ['subscriptions', status ?? null, sessionId ?? null], () => appApi.subscriptions(status ? { status, sessionId } : undefined), { enabled: !!user })

  const flashed = useRef(false)
  const flash = plans.data?.flashStatus ?? null
  const hasPlan = !!plans.data?.activePlan
  const refetch = plans.refetch
  useEffect(() => {
    if (!flash || flashed.current) return
    flashed.current = true
    if (flash === 'success') notify.success(t('toasts.paymentReceived'))
    else notify.info(t('toasts.checkoutCanceled'))
    void invalidate(['me'], ['billingQrCode'])
    // A delayed payment method may still be pending: one later read gives the webhook time to land.
    const timer = flash === 'success' && !hasPlan ? setTimeout(() => void refetch(), 5000) : null
    return () => {
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash])

  async function reload() {
    // Drop the return parameters so the checkout is not mirrored again.
    if (status) router.setParams({ status: undefined, session_id: undefined })
    await invalidate(['subscriptions'], ['me'], ['billingQrCode'], ['qrCode'])
  }

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
      <Stack.Screen options={{ title: t('title') }} />
      <Muted className="italic">{t('tagline')}</Muted>
      <QueryView query={plans}>
        {(data) => (
          <>
            {data.activePlan ? <Text className={data.activePlan.state === 'canceling' ? 'text-sm text-danger' : 'text-sm'}>{planLine(data.activePlan)}</Text> : null}
            {data.activePlan?.canManageBilling ? <ManageBillingButton onChanged={reload} /> : null}
            {data.subscriptions.length > 0 ? <PlanGrid subscriptions={data.subscriptions} activePlan={data.activePlan} onChanged={reload} /> : <EmptyState icon="sparkles-outline" />}
          </>
        )}
      </QueryView>
    </Screen>
  )
}
