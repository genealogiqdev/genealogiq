'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent } from '@genealogiq/ui/card'
import { Checkbox } from '@genealogiq/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@genealogiq/ui/field'
import { Input } from '@genealogiq/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@genealogiq/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { applyManualCoupon } from '@/actions/manual-coupon.actions'
import type { ManualCouponOptions } from '@/queries/manual-coupons'
import type { ManualCouponFormValues } from '@/schemas/manual-coupon.schema'

export function ManualCouponForm({ options, initial }: {
  options: ManualCouponOptions
  initial: { couponId?: string; kind?: string; productId?: string; tenantId?: string; quantity?: string }
}) {
  const t = useTranslations('ManualCoupons')
  const locale = useLocale()
  const router = useRouter()
  const requestId = useRef('')
  const [pending, startTransition] = useTransition()
  const [completed, setCompleted] = useState(false)
  const [completionMessage, setCompletionMessage] = useState<string | undefined>()
  const [accessPending, setAccessPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [couponId, setCouponId] = useState(options.coupons.find((c) => c.id === initial.couponId)?.id
    ?? options.coupons.find((c) => c.code.toLowerCase() === 'gen2026')?.id ?? options.coupons[0]?.id ?? '')
  const [kind, setKind] = useState<ManualCouponFormValues['kind']>(initial.kind === 'partner' || initial.kind === 'consumer' ? initial.kind : 'package')
  const [productId, setProductId] = useState(initial.productId ?? '')
  const [tenantId, setTenantId] = useState(initial.tenantId ?? '')
  const [email, setEmail] = useState('')
  const [quantity, setQuantity] = useState(initial.quantity ?? '20')
  const [cadence, setCadence] = useState<'annual' | 'monthly'>('annual')
  const [source, setSource] = useState<'external_payment' | 'legacy_stock'>('external_payment')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const coupon = options.coupons.find((c) => c.id === couponId)
  const products = options.products.filter((p) => p.kind === kind && (!coupon?.productIds.length || coupon.productIds.includes(p.id)))
  const product = products.find((p) => p.id === productId)
  const subtotal = product ? (kind === 'consumer' && cadence === 'monthly' ? product.monthlyAmount ?? 0 : product.amount)
    * (kind === 'package' ? Number(quantity) || 0 : 1) : 0
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: product?.currency ?? 'BRL' }).format(value)
  const months = kind === 'consumer' && cadence === 'monthly' ? 1 : product?.termMonths ?? 12

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!product || !coupon) return
    setError(null)
    requestId.current ||= crypto.randomUUID()
    startTransition(async () => {
      const result = await applyManualCoupon({
        requestId: requestId.current, couponId, kind, productId,
        tenantId: kind === 'consumer' ? undefined : tenantId,
        consumerEmail: kind === 'consumer' ? email : undefined,
        quantity: kind === 'package' ? Number(quantity) : 1, cadence, source, reference,
        externalAmount: source === 'external_payment' ? Number(amount) : null, confirmed,
      })
      if (!result.ok) { setError(result.message); return }
      setCompleted(true)
      setCompletionMessage(result.message)
      setAccessPending(!!result.data?.accessPending)
      if (result.data?.accessPending) toast.warning(result.message)
      else toast.success(result.message)
      router.refresh()
    })
  }

  if (completed) return (
    <Card><CardContent className="space-y-4 pt-6">
      <p role="status" className="font-medium">{completionMessage ?? t('applied')}</p>
      <p className="text-sm text-muted-foreground">{t('resultNote')}</p>
      {accessPending && <Button asChild variant="outline"><Link href="/customers">{t('manageAccess')}</Link></Button>}
      <Button onClick={() => {
        requestId.current = ''; setCompleted(false); setReference(''); setAmount(''); setConfirmed(false)
      }}>{t('another')}</Button>
    </CardContent></Card>
  )

  return (
    <Card><CardContent className="pt-6">
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="manual-coupon">{t('coupon')}</FieldLabel>
              <Select value={couponId} onValueChange={(value) => { setCouponId(value); setProductId('') }}>
                <SelectTrigger id="manual-coupon"><SelectValue placeholder={t('pickCoupon')} /></SelectTrigger>
                <SelectContent>{options.coupons.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — 100%</SelectItem>)}</SelectContent>
              </Select>
              {!options.coupons.length && <p className="text-sm text-muted-foreground">{t('noCoupons')}</p>}
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-kind">{t('kind')}</FieldLabel>
              <Select value={kind} onValueChange={(value) => { setKind(value as typeof kind); setProductId(''); setCadence('annual') }}>
                <SelectTrigger id="manual-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{(['package', 'partner', 'consumer'] as const).map((value) => <SelectItem key={value} value={value}>{t(`kinds.${value}`)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {kind === 'consumer' ? (
            <Field>
              <FieldLabel htmlFor="manual-email">{t('consumerEmail')}</FieldLabel>
              <Input id="manual-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t('consumerHint')}</p>
            </Field>
          ) : (
            <Field>
              <FieldLabel>{t('partner')}</FieldLabel>
              <SearchableSelect options={options.tenants.map((c) => ({ value: c.id, label: c.name, hint: c.taxId }))}
                value={tenantId} onChange={setTenantId} placeholder={t('pickPartner')}
                searchPlaceholder={t('searchPartner')} emptyMessage={t('noPartner')} />
            </Field>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="manual-product">{t('product')}</FieldLabel>
              <Select value={product?.id ?? ''} onValueChange={(value) => {
                setProductId(value); setCadence('annual')
                const selected = products.find((p) => p.id === value)
                if (selected) setQuantity(String(selected.minimumQuantity))
              }}>
                <SelectTrigger id="manual-product"><SelectValue placeholder={t('pickProduct')} /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              {!products.length && <p className="text-xs text-muted-foreground">{t('noProducts')}</p>}
            </Field>
            {kind === 'package' && (
              <Field>
                <FieldLabel htmlFor="manual-quantity">{t('quantity')}</FieldLabel>
                <Input id="manual-quantity" type="number" required min={product?.minimumQuantity ?? 1} max={10000} step={1}
                  value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
            )}
            {kind === 'consumer' && product && (
              <Field>
                <FieldLabel htmlFor="manual-cadence">{t('period')}</FieldLabel>
                <Select value={cadence} onValueChange={(value) => setCadence(value as typeof cadence)}>
                  <SelectTrigger id="manual-cadence"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">{t('months', { count: product.termMonths })}</SelectItem>
                    {product.monthlyAmount != null && <SelectItem value="monthly">{t('months', { count: 1 })}</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {product && <div className="rounded-lg border bg-muted/30 p-4 space-y-2" aria-live="polite">
            <div className="flex justify-between"><span>{t('subtotal')}</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between"><span>{t('discount')}</span><span>− {money(subtotal)}</span></div>
            <div className="flex justify-between font-semibold"><span>{t('total')}</span><span>{money(0)}</span></div>
            <p className="text-sm text-muted-foreground">{t('termNote', { count: months })}</p>
            {kind === 'partner' && <p className="text-sm">{t('credits', { count: product.quantity })}</p>}
          </div>}

          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="manual-source">{t('source')}</FieldLabel>
              <Select value={source} onValueChange={(value) => { setSource(value as typeof source); setConfirmed(false) }}>
                <SelectTrigger id="manual-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_payment">{t('sources.external_payment')}</SelectItem>
                  <SelectItem value="legacy_stock">{t('sources.legacy_stock')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-reference">{t('reference')}</FieldLabel>
              <Input id="manual-reference" required minLength={3} maxLength={160} value={reference}
                placeholder={t('referencePlaceholder')} onChange={(event) => setReference(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t('referenceHint')}</p>
            </Field>
            {source === 'external_payment' && <Field>
              <FieldLabel htmlFor="manual-amount">{t('externalAmount', { currency: product?.currency ?? 'BRL' })}</FieldLabel>
              <Input id="manual-amount" type="number" required min="0.01" max="9999999999.99" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>}
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="manual-confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
            <label htmlFor="manual-confirm" className="text-sm leading-relaxed">{t('confirmation')}</label>
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={pending || !product || !coupon || !confirmed || (kind !== 'consumer' && !tenantId)}>
            {pending ? t('applying') : t('apply')}
          </Button>
        </fieldset>
      </form>
    </CardContent></Card>
  )
}
