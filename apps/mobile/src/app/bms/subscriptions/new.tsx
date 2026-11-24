import { Stack } from 'expo-router'
import { bmsApi } from '@/api/bms'
import { SubscriptionForm } from '@/features/bms/SubscriptionForm'
import { useGo } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { QueryView, Screen, useNotify } from '@/ui'

export default function SubscriptionNew() {
  const t = useT('Subscriptions')
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['subscriptionNew'], () => bmsApi.subscriptionNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>
        {(view) => (
          <Screen>
            <SubscriptionForm
              initial={view.defaults}
              canEdit={view.canSubmit}
              submitLabel={t('create')}
              save={(values) => bmsApi.createSubscription(values)}
              onSaved={async (message) => {
                if (message) notify.success(message)
                await invalidate(['subscriptions'], ['dashboard'], ['discountCouponNew'], ['discountCouponRedeem'])
                go.replace('/bms/subscriptions')
              }}
            />
          </Screen>
        )}
      </QueryView>
    </>
  )
}
