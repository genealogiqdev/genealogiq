import { Stack, useLocalSearchParams } from 'expo-router'
import { bmsApi, type PartnerPlanDetail, type PartnerPlanFormValues } from '@/api/bms'
import { PlanForm } from '@/features/bms/PlanForm'
import { StatusBadge } from '@/features/bms/fields'
import { useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Heading, KeyValue, Muted, QueryView, Row, Screen, confirm, useAction, useNotify } from '@/ui'

function toForm(plan: PartnerPlanDetail): PartnerPlanFormValues {
  const price = (currency: string) => plan.prices.find((entry) => entry.currency.toUpperCase() === currency)
  const [usd, brl, mxn] = [price('USD'), price('BRL'), price('MXN')]
  return {
    name: plan.name,
    code: plan.code,
    description: plan.description ?? '',
    annualAllowance: plan.annualAllowance,
    rolloverRate: plan.rolloverRate,
    rolloverValidityMonths: plan.rolloverValidityMonths,
    graceDays: plan.graceDays,
    committedReservationMonths: plan.committedReservationMonths,
    activationTrialMonths: plan.activationTrialMonths,
    activationTrialPlanCode: plan.activationTrialPlanCode ?? '',
    cashUsd: usd?.annualCashAmount ?? 0,
    installmentUsd: usd?.installmentAmount ?? 0,
    unitRefUsd: usd?.unitReferenceAmount ?? 0,
    cashBrl: brl?.annualCashAmount ?? 0,
    installmentBrl: brl?.installmentAmount ?? 0,
    unitRefBrl: brl?.unitReferenceAmount ?? 0,
    cashMxn: mxn?.annualCashAmount ?? 0,
    installmentMxn: mxn?.installmentAmount ?? 0,
    unitRefMxn: mxn?.unitReferenceAmount ?? 0,
    installmentCount: plan.prices.find((entry) => entry.installmentCount)?.installmentCount ?? 12,
    isActive: plan.isActive,
  }
}

export default function PlanDetail() {
  const t = useT('PartnerPlans')
  const ts = useT('Subscriptions')
  const tc = useT('Common')
  const { id } = useLocalSearchParams<{ id: string }>()
  const notify = useNotify()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['plan', id], () => bmsApi.plan(id))
  const refresh = useRefresh(query)
  const changed = () => invalidate(['plans'], ['plan', id], ['contractNew'], ['discountCouponNew'], ['discountCouponRedeem'])

  async function sync() {
    const yes = await confirm({ title: ts('stripe.confirmTitle'), message: t('stripe.hint'), confirmLabel: t('stripe.syncButton'), cancelLabel: tc('cancel') })
    if (yes) await action.run(() => bmsApi.syncPartnerPlan(id), { success: true, onSuccess: changed })
  }

  return (
    <>
      <Stack.Screen options={{ title: query.data ? t('form.editTitle', { name: query.data.plan.name }) : t('title') }} />
      <QueryView query={query}>
        {({ plan, stripeProductId, canEdit }) => (
          <Screen {...refresh}>
            <Row className="justify-between">
              <Heading className="flex-1">{plan.name}</Heading>
              <StatusBadge active={plan.isActive} />
            </Row>
            <PlanForm
              key={`${plan.id}:${plan.version}:${plan.isActive}:${plan.prices.map((price) => `${price.id}.${price.version}`).join(',')}`}
              initial={toForm(plan)}
              canEdit={canEdit}
              submitLabel={t('form.save')}
              save={(values) => bmsApi.updatePartnerPlan(plan.id, values)}
              onSaved={async (message) => {
                if (message) notify.success(message)
                await changed()
              }}
            />

            <Card>
              <Heading>{t('stripe.title')}</Heading>
              <KeyValue label={t('stripe.productId')} value={stripeProductId ?? '—'} />
              {plan.prices.map((price) => {
                const synced = !!price.stripeCashPriceId && (price.installmentAmount === null || !!price.stripeInstallmentPriceId)
                return <KeyValue key={price.id} label={price.currency} value={<Badge label={synced ? t('stripe.synced') : t('stripe.notSynced')} color={synced ? 'success' : 'warning'} />} />
              })}
              <Muted>{t('stripe.hint')}</Muted>
              {canEdit ? <Button label={action.pending ? t('stripe.syncing') : t('stripe.syncButton')} variant="secondary" icon="sync-outline" loading={action.pending} onPress={() => void sync()} /> : null}
            </Card>

            {canEdit ? (
              <Button
                label={plan.isActive ? t('actions.deactivate') : t('actions.reactivate')}
                variant={plan.isActive ? 'danger-soft' : 'secondary'}
                disabled={action.pending}
                onPress={() =>
                  void action.run(() => bmsApi.togglePartnerPlanActive(plan.id), {
                    success: plan.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
                    onSuccess: changed,
                  })
                }
                fullWidth
              />
            ) : null}
          </Screen>
        )}
      </QueryView>
    </>
  )
}
