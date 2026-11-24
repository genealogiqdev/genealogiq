import { Stack } from 'expo-router'
import { bmsApi } from '@/api/bms'
import { PlanForm } from '@/features/bms/PlanForm'
import { useGo } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Muted, QueryView, Screen, useNotify } from '@/ui'

export default function PlanNew() {
  const t = useT('PartnerPlans')
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['planNew'], () => bmsApi.planNew())
  return (
    <>
      <Stack.Screen options={{ title: t('form.newTitle') }} />
      <QueryView query={query}>
        {(view) => (
          <Screen>
            <Muted>{t('form.syncAfterCreate')}</Muted>
            <PlanForm
              initial={view.defaults}
              canEdit={view.canSubmit}
              submitLabel={t('form.create')}
              save={(values) => bmsApi.createPartnerPlan(values)}
              onSaved={async (message) => {
                if (message) notify.success(message)
                await invalidate(['plans'], ['contractNew'], ['discountCouponNew'], ['discountCouponRedeem'])
                go.replace('/bms/plans')
              }}
            />
          </Screen>
        )}
      </QueryView>
    </>
  )
}
