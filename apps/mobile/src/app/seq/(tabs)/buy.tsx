import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import type { ActionResponse } from '@/api/client'
import { seqApi, type GenCodePackageOffer, type PartnerCadence, type PlanOrder, type PurchasingPackagesView, type PurchasingPlansView, type StorePlan } from '@/api/seq'
import { Notice } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { formatDate, formatMoney } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { openInBrowser } from '@/lib/share'
import { Badge, Button, Card, Divider, EmptyState, Field, Heading, KeyValue, Muted, QueryView, Row, Screen, Section, Segmented, Text, Title, useNotify } from '@/ui'

type Tab = 'plans' | 'packages'

// Volume coupon of the standalone package offer (web: GENCODE_PACKAGE_OFFER). The
// figure shown here is a preview; the recorded checkout total is computed by the server.
const DISCOUNT_FROM = 50
const DISCOUNT_PERCENT = 10

/** Same integer-cent arithmetic as the web storefront preview. */
function quote(unitPrice: number, quantity: number) {
  const subtotalCents = Math.round(unitPrice * 100) * quantity
  const discountPercent = quantity >= DISCOUNT_FROM ? DISCOUNT_PERCENT : 0
  const discountCents = Math.round((subtotalCents * discountPercent) / 100)
  return {
    subtotalAmount: subtotalCents / 100,
    discountPercent,
    discountAmount: discountCents / 100,
    totalAmount: (subtotalCents - discountCents) / 100,
    effectiveUnitPrice: (subtotalCents - discountCents) / 100 / quantity,
  }
}

/**
 * Opens Stripe Checkout and, once the browser closes, re-reads the orders.
 * Closing the browser proves nothing about payment: only refetched data counts.
 */
function useCheckout(afterClose: () => Promise<unknown>) {
  const notify = useNotify()
  const [pending, setPending] = useState(false)
  async function start(call: () => Promise<ActionResponse<{ url: string }>>, fallback: string) {
    setPending(true)
    try {
      const result = await call()
      if (!result.ok) {
        notify.error(result.message || fallback)
        return
      }
      const url = result.data?.url
      if (!url) {
        notify.error(fallback)
        return
      }
      await openInBrowser(url)
    } catch (failure) {
      notify.error(failure)
    } finally {
      setPending(false)
      await afterClose()
    }
  }
  return { start, pending }
}

function Option({ selected, title, lines, onPress }: { selected: boolean; title: string; lines: string[]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className={`min-h-12 rounded-xl border px-3 py-2 ${selected ? 'border-accent bg-default' : 'border-border'}`}
    >
      <Text className="text-sm font-medium">{title}</Text>
      {lines.map((line) => (
        <Muted key={line}>{line}</Muted>
      ))}
    </Pressable>
  )
}

function PlanCard({ plan, onPurchased }: { plan: StorePlan; onPurchased: () => Promise<unknown> }) {
  const t = useT('Purchasing')
  const ta = useT('Actions.checkout')
  const instalments = plan.installmentCount != null && plan.installmentAmount != null
  // Instalments lead by default, as on the web: the lower-commitment option.
  const [cadence, setCadence] = useState<PartnerCadence>(instalments ? 'installment' : 'cash')
  const checkout = useCheckout(onPurchased)
  const money = (value: number) => formatMoney(value, plan.currency)

  return (
    <Card>
      <Heading>{plan.name}</Heading>
      <Muted>{t('card.allowance', { count: plan.annualAllowance })}</Muted>
      <Title>
        {cadence === 'installment' && instalments
          ? t('card.installmentPrice', { count: plan.installmentCount ?? 0, amount: money(plan.installmentAmount ?? 0) })
          : money(plan.annualCashAmount)}
      </Title>
      {cadence === 'cash' && plan.unitReferenceAmount !== null ? <Muted>{t('card.perGenCode', { amount: money(plan.unitReferenceAmount) })}</Muted> : null}
      {instalments ? (
        <View accessibilityRole="radiogroup" className="gap-2">
          <Option
            selected={cadence === 'installment'}
            title={t('card.installments', { count: plan.installmentCount ?? 0 })}
            lines={[`${money(plan.installmentAmount ?? 0)} ${t('card.perMonth')}`]}
            onPress={() => setCadence('installment')}
          />
          <Option selected={cadence === 'cash'} title={t('card.cash')} lines={[money(plan.annualCashAmount), t('card.bestValue')]} onPress={() => setCadence('cash')} />
        </View>
      ) : null}
      <Button
        label={checkout.pending ? t('card.redirecting') : t('card.subscribe')}
        icon="cart-outline"
        loading={checkout.pending}
        onPress={() => void checkout.start(() => seqApi.subscribeToPartnerPlan(plan.id, cadence), ta('noCheckoutUrl'))}
        fullWidth
      />
    </Card>
  )
}

function planStatus(order: PlanOrder, t: ReturnType<typeof useT>): string {
  switch (order.status) {
    case 'ACTIVE':
      return t('ordersTable.status.active', { date: formatDate(order.currentCycle?.startAt ?? order.createdAt) })
    case 'PENDING':
      return t(order.linkExpired ? 'ordersTable.status.linkExpired' : 'ordersTable.status.pending')
    case 'PAST_DUE':
      return t('ordersTable.status.pastDue')
    case 'EXPIRED':
      return t('ordersTable.status.expired')
    case 'CANCELLED':
      return t('ordersTable.status.cancelled')
    default:
      return order.status
  }
}

function Plans({ query }: { query: UseQueryResult<PurchasingPlansView> }) {
  const t = useT('Purchasing')
  const invalidate = useInvalidate('seq')
  const purchased = () => invalidate(['purchasingPlans'], ['dashboard'])
  return (
    <QueryView query={query}>
      {({ plans, orders }) => (
        <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
          <Heading>{t('title')}</Heading>
          {plans.length === 0 ? <EmptyState title={t('empty.plans')} icon="pricetags-outline" /> : plans.map((plan) => <PlanCard key={plan.id} plan={plan} onPurchased={purchased} />)}
          <Section title={t('ordersTable.title')}>
            {orders.length === 0 ? (
              <Muted>{t('ordersTable.empty')}</Muted>
            ) : (
              orders.map((order) => (
                <Card key={order.id}>
                  <Row className="justify-between">
                    <Text className="flex-1 font-semibold">{order.plan.name}</Text>
                    <Badge label={planStatus(order, t)} color={order.status === 'ACTIVE' ? 'success' : order.status === 'PENDING' && !order.linkExpired ? 'warning' : 'default'} />
                  </Row>
                  <KeyValue label={t('ordersTable.table.requestedAt')} value={formatDate(order.createdAt)} />
                  <KeyValue label={t('ordersTable.table.dueDate')} value={order.currentCycle ? formatDate(order.currentCycle.endAt) : ''} />
                </Card>
              ))
            )}
          </Section>
        </Screen>
      )}
    </QueryView>
  )
}

function PackageStore({ offer, onPurchased }: { offer: GenCodePackageOffer; onPurchased: () => Promise<unknown> }) {
  const t = useT('GenCodePackages')
  const [quantityText, setQuantityText] = useState(String(offer.minimumQuantity))
  const checkout = useCheckout(onPurchased)
  const quantity = Number(quantityText)
  const valid = /^\d+$/.test(quantityText.trim()) && Number.isSafeInteger(quantity) && quantity >= offer.minimumQuantity
  const current = valid ? quote(offer.unitPrice, quantity) : null
  const money = (value: number) => formatMoney(value, offer.currency)
  const presets = [...new Set([offer.minimumQuantity, Math.max(offer.minimumQuantity, DISCOUNT_FROM)])]

  return (
    <>
      <Card>
        <Heading>{t('chooseQuantity')}</Heading>
        <View accessibilityRole="radiogroup" className="gap-2">
          {presets.map((count) => {
            const preset = quote(offer.unitPrice, count)
            return (
              <Option
                key={count}
                selected={valid && quantity === count}
                title={t('units', { count })}
                lines={[
                  t('perUnit', { amount: money(preset.effectiveUnitPrice) }),
                  money(preset.totalAmount),
                  preset.discountPercent ? t('coupon', { percent: preset.discountPercent }) : t('standardPrice'),
                ]}
                onPress={() => setQuantityText(String(count))}
              />
            )
          })}
        </View>
        <Field
          label={t('quantity')}
          value={quantityText}
          onChangeText={setQuantityText}
          keyboardType="number-pad"
          maxLength={7}
          disabled={checkout.pending}
          error={valid ? null : t('minimumQuantity', { count: offer.minimumQuantity })}
          hint={t('minimumQuantity', { count: offer.minimumQuantity })}
        />
        <Muted>{t('discountHint', { count: DISCOUNT_FROM, percent: DISCOUNT_PERCENT })}</Muted>
      </Card>

      <Card>
        <Heading>{t('summary')}</Heading>
        <View accessibilityLiveRegion="polite">
          {current ? (
            <>
              <KeyValue label={t('quantity')} value={t('units', { count: quantity })} />
              <KeyValue label={t('unitPrice')} value={money(current.effectiveUnitPrice)} />
              <KeyValue label={t('subtotal')} value={money(current.subtotalAmount)} />
              {current.discountPercent > 0 ? <KeyValue label={t('coupon', { percent: current.discountPercent })} value={`−${money(current.discountAmount)}`} /> : null}
              <Divider />
              <Row className="justify-between pt-2">
                <Text className="font-semibold">{t('total')}</Text>
                <Title>{money(current.totalAmount)}</Title>
              </Row>
            </>
          ) : (
            <Muted>{t('invalidQuantity')}</Muted>
          )}
        </View>
        <Muted>{t('paymentHint')}</Muted>
        <Button
          label={checkout.pending ? t('redirecting') : t('buy')}
          icon="cart-outline"
          loading={checkout.pending}
          disabled={!valid || !offer.available}
          onPress={() => void checkout.start(() => seqApi.purchaseGenCodePackage(quantity), t('checkoutFailed'))}
          fullWidth
        />
        {offer.available ? null : <Notice>{t('unavailable')}</Notice>}
      </Card>
    </>
  )
}

function Packages({ query }: { query: UseQueryResult<PurchasingPackagesView> }) {
  const t = useT('GenCodePackages')
  const invalidate = useInvalidate('seq')
  const purchased = () => invalidate(['purchasingPackages'], ['dashboard'], ['activations'])
  const status: Record<string, string> = { PENDING: t('orders.pending'), PAID: t('orders.paid'), FAILED: t('orders.failed'), EXPIRED: t('orders.expired') }
  return (
    <QueryView query={query}>
      {({ offer, orders }) => (
        <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
          <View>
            <Heading>{t('title')}</Heading>
            <Muted>{t('description')}</Muted>
          </View>
          {offer ? <PackageStore offer={offer} onPurchased={purchased} /> : <Notice>{t('unavailable')}</Notice>}
          <Section title={t('orders.title')}>
            {orders.length === 0 ? (
              <Muted>{t('orders.empty')}</Muted>
            ) : (
              orders.map((order) => (
                <Card key={order.id}>
                  <Row className="justify-between">
                    <Text className="flex-1 font-semibold">{t('units', { count: order.quantity })}</Text>
                    <Badge label={status[order.status] ?? order.status} color={order.status === 'PAID' ? 'success' : order.status === 'PENDING' ? 'warning' : 'default'} />
                  </Row>
                  <KeyValue label={t('orders.requestedAt')} value={formatDate(order.createdAt)} />
                  {order.discountAmount > 0 ? (
                    <KeyValue label={t('orders.discount')} value={`${formatMoney(order.discountAmount, order.currency)}${order.discountCode ? ` · ${order.discountCode}` : ''}`} />
                  ) : null}
                  <KeyValue label={t('total')} value={formatMoney(order.totalAmount, order.currency)} />
                  <KeyValue label={t('orders.expiresAt')} value={order.creditExpiresAt ? formatDate(order.creditExpiresAt) : ''} />
                </Card>
              ))
            )}
          </Section>
        </Screen>
      )}
    </QueryView>
  )
}

export default function SeqBuy() {
  const t = useT('Sidebar.items')
  const [tab, setTab] = useState<Tab>('plans')
  const plans = useView('seq', ['purchasingPlans'], () => seqApi.purchasingPlans())
  const packages = useView('seq', ['purchasingPackages'], () => seqApi.purchasingPackages(), { enabled: tab === 'packages' })
  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'plans', label: t('buyGenCodes') },
            { value: 'packages', label: t('genCodePackages') },
          ]}
        />
      </View>
      {tab === 'plans' ? <Plans query={plans} /> : <Packages query={packages} />}
    </View>
  )
}
