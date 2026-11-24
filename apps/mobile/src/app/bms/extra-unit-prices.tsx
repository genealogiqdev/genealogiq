import { Stack } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type ExtraUnitPriceFormValues, type ExtraUnitPriceRow } from '@/api/bms'
import { FormError, NumField } from '@/features/bms/fields'
import { useFormSubmit, useRefresh, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, EmptyState, Heading, KeyValue, QueryView, Row, Screen, confirm, useAction, useNotify } from '@/ui'

const FIELDS = [
  { currency: 'USD', key: 'priceUsd', stripe: 'stripePriceIdUsd' },
  { currency: 'BRL', key: 'priceBrl', stripe: 'stripePriceIdBrl' },
  { currency: 'MXN', key: 'priceMxn', stripe: 'stripePriceIdMxn' },
] as const

function PriceCard({ row, canEdit }: { row: ExtraUnitPriceRow; canEdit: boolean }) {
  const t = useT('ExtraUnitPrices')
  const ts = useT('Subscriptions')
  const tc = useT('Common')
  const rules = useRules()
  const notify = useNotify()
  const form = useFormSubmit()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const [values, setValues] = useState<ExtraUnitPriceFormValues>({ priceUsd: row.priceUsd ?? 0, priceBrl: row.priceBrl ?? 0, priceMxn: row.priceMxn ?? 0 })
  const title = `${t.has(`resource.${row.resource}`) ? t(`resource.${row.resource}`) : row.resource} · ${t.has(`tier.${row.tier}`) ? t(`tier.${row.tier}`) : row.tier}`

  function save() {
    if (form.invalid({ priceUsd: rules.price(values.priceUsd), priceBrl: rules.price(values.priceBrl), priceMxn: rules.price(values.priceMxn) })) return
    void form.submit(
      () => bmsApi.updateExtraUnitPrice(row.id, values),
      async (response) => {
        notify.success(response.message ?? tc('toasts.saved'))
        await invalidate(['extraUnitPrices'])
      },
    )
  }

  async function sync() {
    const yes = await confirm({ title: ts('stripe.confirmTitle'), message: title, confirmLabel: t('stripe.syncButton'), cancelLabel: tc('cancel') })
    if (yes) await action.run(() => bmsApi.syncExtraUnitPriceWithStripe(row.id), { success: true, onSuccess: () => invalidate(['extraUnitPrices']) })
  }

  return (
    <Card>
      <Heading>{title}</Heading>
      <FormError message={form.error} />
      {FIELDS.map((field) =>
        canEdit ? (
          <NumField
            key={field.key}
            label={field.currency}
            value={values[field.key]}
            onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            error={form.errors[field.key]}
          />
        ) : (
          <KeyValue key={field.key} label={field.currency} value={row[field.key] ? formatMoney(row[field.key], field.currency) : '—'} />
        ),
      )}
      <Row className="flex-wrap">
        {FIELDS.map((field) => {
          const priced = (row[field.key] ?? 0) > 0
          const synced = !!row[field.stripe]
          return (
            <Badge
              key={field.key}
              label={`${field.currency}: ${!priced ? t('stripe.notConfigured') : synced ? t('stripe.synced') : t('stripe.notSynced')}`}
              color={!priced ? 'default' : synced ? 'success' : 'warning'}
            />
          )
        })}
      </Row>
      {canEdit ? (
        <Row>
          <Button label={form.pending ? tc('saving') : tc('save')} size="sm" loading={form.pending} onPress={save} />
          <Button label={action.pending ? t('stripe.syncing') : t('stripe.syncButton')} size="sm" variant="secondary" icon="sync-outline" loading={action.pending} onPress={() => void sync()} />
        </Row>
      ) : null}
    </Card>
  )
}

export default function ExtraUnitPrices() {
  const t = useT('ExtraUnitPrices')
  const query = useView('bms', ['extraUnitPrices'], () => bmsApi.extraUnitPrices())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => (
          <Screen {...refresh}>
            {data.prices.length === 0 ? <EmptyState /> : null}
            {data.prices.map((row) => (
              <PriceCard key={`${row.id}:${row.priceUsd}:${row.priceBrl}:${row.priceMxn}`} row={row} canEdit={data.canEdit} />
            ))}
          </Screen>
        )}
      </QueryView>
    </>
  )
}
