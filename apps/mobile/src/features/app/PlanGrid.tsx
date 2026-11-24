import { useState } from 'react'
import { View } from 'react-native'
import { appApi, type ActivePlanSummary, type Cadence, type SubscriptionOption } from '@/api/app'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/format'
import { openInBrowser } from '@/lib/share'
import { Badge, Button, Card, Heading, Icon, Muted, Row, Segmented, Text, Title, confirm, useAction, useNotify } from '@/ui'
import { longDate } from './ProfileCards'

function monthlyEquivalent(plan: { price: number; termLength: number | null; monthlyPrice: number | null }): number {
  if (plan.monthlyPrice != null) return Number(plan.monthlyPrice)
  const term = plan.termLength ?? 0
  return term > 0 ? Number(plan.price) / term : 0
}

interface PlanGridProps {
  subscriptions: readonly SubscriptionOption[]
  activePlan: ActivePlanSummary | null
  /** Re-read the plan from the server (after the browser closes or a plan change). */
  onChanged: () => Promise<unknown> | void
}

/** Plan cards with cadence, checkout and plan change, following the web `SubscriptionsGrid`. */
export function PlanGrid({ subscriptions, activePlan, onChanged }: PlanGridProps) {
  const activeId = activePlan?.subscription.id ?? null
  return (
    <View className="gap-4">
      {subscriptions.map((plan) => (
        <PlanCard key={plan.id} plan={plan} activePlan={activePlan} isActive={activeId ? activeId === plan.id : plan.code === 'FREE'} onChanged={onChanged} />
      ))}
    </View>
  )
}

function PlanCard({ plan, activePlan, isActive, onChanged }: { plan: SubscriptionOption; activePlan: ActivePlanSummary | null; isActive: boolean; onChanged: () => Promise<unknown> | void }) {
  const t = useT('Subscriptions')
  const tc = useT('Mobile.common')
  const tm = useT('Mobile.app')
  const { run, pending } = useAction()
  const notify = useNotify()
  const [selected, setSelected] = useState<Cadence>('annual')

  const isFree = plan.code === 'FREE'
  const granted = activePlan?.state === 'gift' || activePlan?.state === 'manual'
  // The active card shows what is really being paid (stored currency and cadence), never the local toggle.
  const activeCadence: Cadence = activePlan?.cadence === 'monthly' ? 'monthly' : 'annual'
  const cadence = isActive ? activeCadence : selected
  const price = cadence === 'annual' ? Number(plan.price) : monthlyEquivalent(plan)
  const currency = isActive ? (activePlan?.currency ?? plan.currency) : plan.currency
  const term = plan.termLength ?? 0
  const termSuffix = cadence === 'annual' ? (term === 12 ? t('term.perYear') : term === 0 ? t('term.perLifetime') : t('term.perMonths', { count: term })) : t('term.perMonth')
  const canBuy = !isFree && !isActive && !granted
  const bestValue = !isFree && cadence === 'annual' && activePlan?.state !== 'gift'

  const q = plan.quotas
  const features: string[] = [
    t('features.treeMembers', { count: q.treeMaxMembers }),
    t('features.bioChars', { count: q.bioMaxChars }),
    t('features.documents', { count: q.documentsMax }),
    t('features.mediaImages', { count: q.mediaMaxImages }),
    t('features.mediaVideos', { count: q.mediaMaxVideos }),
    t('features.geoPlaces', { count: q.geoPlacesMax }),
    t(isFree ? 'features.geoPlacesExtra' : 'features.geoPlacesExtraCheaper'),
    t('features.memorials', { count: q.memorialsMax }),
    t('features.qrCodeCount', { count: q.qrCodeMax }),
    t(isFree ? 'features.qrExtra' : 'features.qrExtraCheaper'),
    ...(q.petsMax > 0 ? [t('features.petsCount', { count: q.petsMax })] : []),
  ]

  async function checkout() {
    const result = await run(() => appApi.createCheckoutSession(plan.id, selected))
    const url = result?.data?.url
    if (!url) return
    // Entitlement is only ever read back from the server once the browser closes.
    await openInBrowser(url)
    await onChanged()
  }

  async function change() {
    if (!activePlan) return
    const upgrade = monthlyEquivalent(plan) - monthlyEquivalent(activePlan.subscription) >= 0
    const cadenceLabel = selected === 'annual' ? t('cadence.annual') : t('cadence.monthly')
    const periodEnd = longDate(activePlan.currentPeriodEnd)
    const confirmed = await confirm({
      title: upgrade ? t('confirm.upgradeTitle') : t('confirm.downgradeTitle'),
      message: upgrade
        ? t('confirm.upgradeDescription', { plan: plan.name, cadence: cadenceLabel })
        : t('confirm.downgradeDescription', { currentPlan: activePlan.subscription.name, periodEnd, plan: plan.name, cadence: cadenceLabel }),
      confirmLabel: upgrade ? t('confirm.upgradeAction') : t('confirm.downgradeAction'),
      cancelLabel: tc('cancel'),
    })
    if (!confirmed) return
    await run(() => appApi.changeSubscription(plan.id, selected), {
      onSuccess: async (response) => {
        notify.success(response.data?.effect === 'upgraded' ? t('toasts.switched', { plan: plan.name }) : t('toasts.scheduled', { plan: plan.name, periodEnd }))
        await onChanged()
      },
    })
  }

  return (
    <Card>
      <Row className="justify-between">
        <Heading className="flex-1 text-xl">{plan.name}</Heading>
        {isActive ? <Badge label={t('activeBadge')} color="accent" /> : null}
      </Row>
      {plan.description ? <Muted>{plan.description}</Muted> : null}

      {canBuy ? (
        <Segmented<Cadence>
          value={selected}
          onChange={setSelected}
          options={[
            { value: 'monthly', label: t('tabs.monthly') },
            { value: 'annual', label: t('tabs.yearly') },
          ]}
        />
      ) : null}

      {isActive && activePlan?.state === 'gift' ? (
        <Text className="text-lg font-semibold">{t('giftPrice')}</Text>
      ) : isActive && activePlan?.state === 'manual' ? (
        <Text className="text-lg font-semibold">{tm('plans.manualPrice')}</Text>
      ) : isFree ? (
        <Title>{t('freePrice')}</Title>
      ) : (
        <View className="flex-row flex-wrap items-baseline gap-1">
          <Muted>{t('onlyPrefix')}</Muted>
          <Title>{formatMoney(price, currency)}</Title>
          <Muted>{termSuffix}</Muted>
        </View>
      )}
      {bestValue ? (
        <View className="self-start">
          <Badge label={t('bestValue')} color="warning" />
        </View>
      ) : null}

      <View className="gap-2 py-1">
        {features.map((feature) => (
          <View key={feature} className="flex-row items-start gap-2">
            <Icon name="checkmark" size={16} />
            <Text className="flex-1 text-sm">{feature}</Text>
          </View>
        ))}
      </View>

      {canBuy ? (
        <Button
          label={pending ? (activePlan ? t('confirm.working') : t('opening')) : `${formatMoney(price, currency)} ${termSuffix}`}
          loading={pending}
          onPress={() => void (activePlan ? change() : checkout())}
          fullWidth
        />
      ) : null}
    </Card>
  )
}

/** The line under the title describing the current plan, in the web page's precedence. */
export function useActivePlanLine(): (plan: ActivePlanSummary) => string {
  const t = useT('Subscriptions')
  return (plan) => {
    const values = { plan: plan.subscription.name, date: longDate(plan.currentPeriodEnd) }
    if (plan.state === 'gift') return t('giftActive', values)
    if (plan.state === 'manual') return t('manualActive', values)
    if (plan.state === 'canceling') return t('cancelingOn', values)
    return t('currentlyOn', values)
  }
}

/** "Manage subscription": opens the Stripe billing portal, then re-reads the plan. */
export function ManageBillingButton({ onChanged }: { onChanged: () => Promise<unknown> | void }) {
  const t = useT('Subscriptions')
  const { run, pending } = useAction()
  async function open() {
    const result = await run(() => appApi.createPortalSession())
    const url = result?.data?.url
    if (!url) return
    await openInBrowser(url)
    await onChanged()
  }
  return <Button label={pending ? t('opening') : t('manageSubscription')} icon="card-outline" variant="secondary" loading={pending} onPress={() => void open()} fullWidth />
}
