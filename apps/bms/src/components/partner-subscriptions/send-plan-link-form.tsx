'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner'
import { sendPartnerPlanLink } from '@/actions/partner-plan.actions'
import type { PartnerCadence } from '@genealogiq/services/partner-checkout'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Separator } from '@genealogiq/ui/separator'
import { Field, FieldError, FieldLabel } from '@genealogiq/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@genealogiq/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'

export interface LinkTenant { id: string; name: string; taxId: string }
export interface LinkPlan {
  id: string; name: string; code: string; annualAllowance: number
  currency: string; annualCashAmount: number
  stripeSynced: boolean
  installmentCount: number | null; installmentAmount: number | null
}
export interface LinkCoupon { id: string; code: string; discountType: string; value: number; productIds: string[]; redemptionMode: string }

/**
 * The operator-driven half of subscribing a partner.
 *
 * Only lists plans that are priced AND synced in the operator's currency — the
 * same rule the self-serve store follows. Offering one that is not synced would
 * fail at Stripe after the contract row was already written.
 */
export function SendPlanLinkForm({
  tenants, plans, coupons,
}: { tenants: LinkTenant[]; plans: LinkPlan[]; coupons: LinkCoupon[] }) {
  const t = useTranslations('Contracts')
  const tc = useTranslations('Common')
  const tm = useTranslations('ManualCoupons')
  const locale = useLocale()
  const router = useRouter()

  const [tenantId, setTenantId] = useState('')
  const [planId, setPlanId]     = useState('')
  const [cadence, setCadence]   = useState<PartnerCadence>('cash')
  const [couponId, setCouponId] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [sending, setSending]   = useState(false)

  const plan = plans.find((p) => p.id === planId)
  const money = (v: number, c: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: c }).format(v)

  // A coupon restricted to other plans must not be offerable here — Stripe
  // would reject it at checkout, after the link had already gone out.
  const eligibleCoupons = useMemo(
    () => coupons.filter((c) => c.productIds.length === 0 || (planId && c.productIds.includes(planId))),
    [coupons, planId],
  )

  const offersInstalments = !!plan && plan.installmentCount != null && plan.installmentAmount != null
  const manual = eligibleCoupons.find((c) => c.id === couponId)?.redemptionMode === 'manual'

  async function handleSend() {
    if (manual) {
      router.push(`/sales/discount-coupons/redeem?${new URLSearchParams({ couponId, kind: 'partner', productId: planId, tenantId })}`)
      return
    }
    setError(null)
    setSending(true)
    const result = await sendPartnerPlanLink(tenantId, planId, cadence, couponId || null)
    setSending(false)
    if (!result.ok) { setError(result.message); return }
    toast.success(t('link.sent', { email: result.data!.email }))
    router.push('/sales/contracts')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-bold tracking-tight">{t('link.newTitle')}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-6">
        <Field>
          <FieldLabel>{t('link.partner')}</FieldLabel>
          {/* Typed search rather than a plain select: the customer list grows
              without bound, and scrolling four hundred customers to find one
              is not a thing anyone should have to do.
              The label is `name` — the person's given name or the company's
              legal name. The tax id rides along underneath, because that is what
              separates two rows that read alike. Search matches both. */}
          <SearchableSelect
            options={tenants.map((c) => ({
              value: c.id,
              label: c.name,
              hint:  c.taxId,
            }))}
            value={tenantId}
            onChange={setTenantId}
            placeholder={t('link.pickPartner')}
            searchPlaceholder={t('link.searchPartner')}
            emptyMessage={t('link.noPartnerFound')}
          />
        </Field>

        <Field>
          <FieldLabel>{t('link.plan')}</FieldLabel>
          <Select value={planId} onValueChange={(v) => { setPlanId(v); setCouponId('') }}>
            <SelectTrigger><SelectValue placeholder={t('link.pickPlan')} /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} | {money(p.annualCashAmount, p.currency)} ({t('link.units', { count: p.annualAllowance })})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {plans.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('link.noPlans')}</p>
          )}
        </Field>

        {plan && !manual && (
          <Field>
            <FieldLabel>{t('link.cadence')}</FieldLabel>
            <Select value={cadence} onValueChange={(v) => setCadence(v as PartnerCadence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  {t('link.cash', { amount: money(plan.annualCashAmount, plan.currency) })}
                </SelectItem>
                {offersInstalments && (
                  <SelectItem value="installment">
                    {t('link.installments', {
                      count: plan.installmentCount!,
                      amount: money(plan.installmentAmount!, plan.currency),
                    })}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
        )}

        {eligibleCoupons.length > 0 && (
          <Field>
            <FieldLabel>{t('link.coupon')}</FieldLabel>
            <Select value={couponId || '__none__'} onValueChange={(v) => setCouponId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder={t('link.noCoupon')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('link.noCoupon')}</SelectItem>
                {eligibleCoupons.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.discountType === 'percent' ? `${c.value}%` : money(c.value, plan?.currency ?? 'USD')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Stripe caps a Checkout Session at 24 hours and rejects anything
            longer. Saying so up front beats an operator wondering why the link
            they sent on Friday is dead on Monday. */}
        <p className="text-xs text-muted-foreground">{manual ? tm('description') : !plan?.stripeSynced && plan ? tm('needsCoupon') : t('link.expiryNote')}</p>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex items-center gap-3">
          <Button onClick={handleSend} disabled={!tenantId || !planId || sending || (!manual && !plan?.stripeSynced)}>
            {manual ? tm('review') : sending ? t('link.sending') : t('link.send')}
          </Button>
          <Button variant="outline" onClick={() => router.push('/sales/contracts')}>{tc('cancel')}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
