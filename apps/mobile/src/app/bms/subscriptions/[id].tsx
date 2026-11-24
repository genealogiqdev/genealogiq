import { Stack, useLocalSearchParams } from 'expo-router'
import { bmsApi, type SubscriptionDetail, type SubscriptionFormValues } from '@/api/bms'
import { SubscriptionForm } from '@/features/bms/SubscriptionForm'
import { StatusBadge } from '@/features/bms/fields'
import { canDelete, useGo, useMe, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Heading, KeyValue, Muted, QueryView, Row, Screen, confirm, useAction, useNotify } from '@/ui'

function toForm(row: SubscriptionDetail): SubscriptionFormValues {
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    isActive: row.isActive,
    termLength: row.termLength,
    priceUsd: row.priceUsd,
    monthlyPriceUsd: row.monthlyPriceUsd ?? 0,
    priceBrl: row.priceBrl ?? 0,
    monthlyPriceBrl: row.monthlyPriceBrl ?? 0,
    priceMxn: row.priceMxn ?? 0,
    monthlyPriceMxn: row.monthlyPriceMxn ?? 0,
    treeMaxMembers: row.treeMaxMembers,
    bioMaxChars: row.bioMaxChars,
    mediaMaxImages: row.mediaMaxImages,
    mediaMaxVideos: row.mediaMaxVideos,
    documentsMax: row.documentsMax,
    geoPlacesMax: row.geoPlacesMax,
    memorialsMax: row.memorialsMax,
    petsMax: row.petsMax,
    qrCodeMax: row.qrCodeMax,
  }
}

export default function SubscriptionDetailScreen() {
  const t = useT('Subscriptions')
  const tc = useT('Common')
  const { id } = useLocalSearchParams<{ id: string }>()
  const go = useGo()
  const me = useMe()
  const notify = useNotify()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['subscription', id], () => bmsApi.subscription(id))
  const refresh = useRefresh(query)
  const changed = () => invalidate(['subscriptions'], ['subscription', id], ['dashboard'], ['discountCouponNew'], ['discountCouponRedeem'])

  async function sync() {
    const yes = await confirm({ title: t('stripe.confirmTitle'), message: t('stripe.confirmDescription'), confirmLabel: t('stripe.syncNow'), cancelLabel: tc('cancel') })
    if (yes) await action.run(() => bmsApi.syncSubscriptionWithStripe(id), { success: true, onSuccess: changed })
  }

  async function remove(name: string) {
    const yes = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name })}\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await action.run(() => bmsApi.deleteSubscription(id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['subscriptions'], ['dashboard'])
        go.back()
      },
    })
  }

  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>
        {({ subscription, canEdit }) => {
          const currencies = [
            { code: 'USD', priced: subscription.priceUsd > 0, synced: !!subscription.stripeAnnualPriceIdUsd },
            { code: 'BRL', priced: (subscription.priceBrl ?? 0) > 0, synced: !!subscription.stripeAnnualPriceIdBrl },
            { code: 'MXN', priced: (subscription.priceMxn ?? 0) > 0, synced: !!subscription.stripeAnnualPriceIdMxn },
          ]
          return (
            <Screen {...refresh}>
              <Row className="justify-between">
                <Heading className="flex-1">{subscription.name}</Heading>
                <StatusBadge active={subscription.isActive} />
              </Row>
              <SubscriptionForm
                key={`${subscription.id}:${subscription.isActive}:${subscription.prices.map((price) => `${price.id}.${price.version}`).join(',')}`}
                initial={toForm(subscription)}
                canEdit={canEdit}
                submitLabel={tc('save')}
                save={(values) => bmsApi.updateSubscription(subscription.id, values)}
                onSaved={async (message) => {
                  if (message) notify.success(message)
                  await changed()
                }}
              />

              <Card>
                <Heading>{t('stripe.title')}</Heading>
                {currencies.map((currency) => (
                  <KeyValue
                    key={currency.code}
                    label={currency.code}
                    value={
                      <Badge
                        label={!currency.priced ? t('stripe.notConfigured') : currency.synced ? t('stripe.synced') : t('stripe.notSynced')}
                        color={!currency.priced ? 'default' : currency.synced ? 'success' : 'warning'}
                      />
                    }
                  />
                ))}
                <Muted>{t('stripe.hint')}</Muted>
                {canEdit ? <Button label={action.pending ? t('stripe.syncing') : t('stripe.syncButton')} variant="secondary" icon="sync-outline" loading={action.pending} onPress={() => void sync()} /> : null}
              </Card>

              {canEdit ? (
                <>
                  <Button
                    label={subscription.isActive ? t('actions.deactivate') : t('actions.reactivate')}
                    variant="secondary"
                    disabled={action.pending}
                    onPress={() =>
                      void action.run(() => bmsApi.toggleSubscriptionActive(subscription.id), {
                        success: subscription.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
                        onSuccess: changed,
                      })
                    }
                    fullWidth
                  />
                  {canDelete(me.data?.role) ? (
                    <Button label={t('actions.delete')} variant="danger-soft" icon="trash-outline" disabled={action.pending} onPress={() => void remove(subscription.name)} fullWidth />
                  ) : null}
                </>
              ) : null}
            </Screen>
          )
        }}
      </QueryView>
    </>
  )
}
