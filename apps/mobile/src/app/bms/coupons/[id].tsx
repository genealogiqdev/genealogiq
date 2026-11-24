import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type DiscountCouponView } from '@/api/bms'
import { couponDiscount, couponDuration } from '@/features/bms/coupons'
import { FormError, ReadOnlyNote, StatusBadge } from '@/features/bms/fields'
import { useFormSubmit, useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Card, Field, Heading, KeyValue, Muted, QueryView, Row, Screen, useAction, useNotify } from '@/ui'

function Editor({ view, refresh }: { view: DiscountCouponView; refresh: { refreshing: boolean; onRefresh: () => void } }) {
  const t = useT('DiscountCoupons')
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const action = useAction()
  const { coupon, canEdit } = view
  const [description, setDescription] = useState(coupon.description ?? '')
  const changed = () => invalidate(['discountCoupons'], ['discountCoupon', coupon.id], ['discountCouponRedeem'], ['contractNew'], ['gencodesNew'])

  function save() {
    if (description.length > 255) {
      form.invalid({ description: undefined })
      return
    }
    void form.submit(
      () => bmsApi.updateDiscountCoupon(coupon.id, { description: description.trim() || null }),
      async (response) => {
        if (response.message) notify.success(response.message)
        await changed()
      },
    )
  }

  return (
    <Screen {...refresh}>
      <Row className="justify-between">
        <Heading className="flex-1">{coupon.code}</Heading>
        <StatusBadge active={coupon.isActive} />
      </Row>
      <Muted>{t('hints.codeImmutable')}</Muted>
      <Card>
        <KeyValue label={t('table.discount')} value={couponDiscount(coupon, t)} />
        <KeyValue label={t('table.duration')} value={couponDuration(coupon, t)} />
        <KeyValue label={t('table.maxUses')} value={coupon.maxRedemptions === null ? t('table.unlimited') : String(coupon.maxRedemptions)} />
        <KeyValue label={t('table.expires')} value={coupon.redeemBy ? formatDate(coupon.redeemBy) : t('table.never')} />
        <KeyValue label={t('fields.redemptionMode')} value={t(coupon.redemptionMode === 'manual' ? 'redemptionMode.manual' : 'redemptionMode.stripe')} />
        <KeyValue label={t('table.createdAt')} value={formatDate(coupon.createdAt)} />
        {coupon.appliesTo.length > 0 ? <KeyValue label={t('fields.appliesTo')} value={coupon.appliesTo.map((product) => product.name).join(', ')} /> : null}
      </Card>

      {canEdit ? null : <ReadOnlyNote />}
      <FormError message={form.error} />
      <Field
        label={t('fields.description')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('placeholders.descriptionEdit')}
        maxLength={255}
        multiline
        disabled={!canEdit}
        error={form.errors.description}
      />
      {canEdit ? (
        <>
          <Button label={t('saveChanges')} onPress={save} loading={form.pending} fullWidth />
          {coupon.redemptionMode === 'manual' && coupon.isActive ? (
            <Button label={t('actions.apply')} variant="secondary" onPress={() => go.push('/bms/coupons/redeem', { couponId: coupon.id })} fullWidth />
          ) : null}
          <Button
            label={coupon.isActive ? t('actions.deactivate') : t('actions.reactivate')}
            variant={coupon.isActive ? 'danger-soft' : 'secondary'}
            disabled={action.pending}
            onPress={() =>
              void action.run(() => bmsApi.toggleDiscountCouponActive(coupon.id), {
                success: coupon.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
                onSuccess: changed,
              })
            }
            fullWidth
          />
        </>
      ) : null}
    </Screen>
  )
}

export default function CouponDetail() {
  const t = useT('DiscountCoupons')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('bms', ['discountCoupon', id], () => bmsApi.discountCoupon(id))
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>{(view) => <Editor key={view.coupon.id} view={view} refresh={refresh} />}</QueryView>
    </>
  )
}
