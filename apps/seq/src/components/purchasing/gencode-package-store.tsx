'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ShoppingCart, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { GENCODE_PACKAGE_OFFER, quoteGenCodePackage } from '@genealogiq/core'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Input } from '@genealogiq/ui/input'
import { Label } from '@genealogiq/ui/label'
import { Separator } from '@genealogiq/ui/separator'
import { purchaseGenCodePackage } from '@/actions/gencode-package.actions'
import type { GenCodePackageOffer } from '@/queries/purchasing'

export function GenCodePackageStore({ offer }: { offer: GenCodePackageOffer }) {
  const t = useTranslations('GenCodePackages')
  const locale = useLocale()
  const router = useRouter()
  const [quantityText, setQuantityText] = useState(String(offer.minimumQuantity))
  const [isPending, startTransition] = useTransition()
  const quantity = Number(quantityText)
  const valid = quantityText.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= offer.minimumQuantity
  const quote = valid ? quoteGenCodePackage(offer.unitPrice, quantity) : null
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: offer.currency })
  const presets = [...new Set([offer.minimumQuantity, Math.max(offer.minimumQuantity, GENCODE_PACKAGE_OFFER.discountFrom)])]

  function handleBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || !offer.available || isPending) return
    startTransition(async () => {
      try {
        const result = await purchaseGenCodePackage({ quantity })
        if (!result.ok) { toast.error(result.message); return }
        router.push(result.data!.url)
      } catch {
        toast.error(t('checkoutFailed'))
      }
    })
  }

  return (
    <form onSubmit={handleBuy} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('chooseQuantity')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {presets.map((count) => {
              const preset = quoteGenCodePackage(offer.unitPrice, count)
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={quantity === count}
                  disabled={isPending}
                  onClick={() => setQuantityText(String(count))}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-5 text-left transition-colors disabled:opacity-60 ${quantity === count ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}
                >
                  <span className="text-xl font-bold">{t('units', { count })}</span>
                  <span className="text-sm text-muted-foreground">{t('perUnit', { amount: money.format(preset.effectiveUnitPrice) })}</span>
                  <span className="text-2xl font-bold tabular-nums">{money.format(preset.totalAmount)}</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${preset.discountPercent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {preset.discountPercent ? <><Tag className="size-4" />{t('coupon', { percent: preset.discountPercent })}</> : t('standardPrice')}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gencode-quantity">{t('quantity')}</Label>
            <Input
              id="gencode-quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={offer.minimumQuantity}
              step={1}
              required
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value)}
              disabled={isPending}
              aria-invalid={!valid}
              aria-describedby="gencode-quantity-help"
              className="max-w-xs"
            />
            <p id="gencode-quantity-help" className={`text-sm ${valid ? 'text-muted-foreground' : 'text-destructive'}`}>
              {t('minimumQuantity', { count: offer.minimumQuantity })}
            </p>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Tag className="mt-0.5 size-4 shrink-0" />
            {t('discountHint', { count: GENCODE_PACKAGE_OFFER.discountFrom, percent: GENCODE_PACKAGE_OFFER.discountPercent })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('summary')}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div aria-live="polite" aria-atomic="true">
            {quote ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt>{t('quantity')}</dt><dd className="font-medium">{t('units', { count: quantity })}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t('unitPrice')}</dt><dd>{money.format(quote.effectiveUnitPrice)}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t('subtotal')}</dt><dd>{money.format(quote.subtotalAmount)}</dd></div>
                {quote.discountPercent > 0 && <div className="flex justify-between gap-3 text-primary"><dt>{t('coupon', { percent: quote.discountPercent })}</dt><dd>−{money.format(quote.discountAmount)}</dd></div>}
                <Separator />
                <div className="flex flex-wrap items-baseline justify-between gap-3"><dt className="font-semibold">{t('total')}</dt><dd className="text-3xl font-bold tabular-nums">{money.format(quote.totalAmount)}</dd></div>
              </dl>
            ) : <p className="text-sm text-muted-foreground">{t('invalidQuantity')}</p>}
          </div>
          <p className="text-sm text-muted-foreground">{t('paymentHint')}</p>
          <Button className="w-full" type="submit" disabled={!valid || !offer.available || isPending}>
            <ShoppingCart className="size-4" />
            {isPending ? t('redirecting') : t('buy')}
          </Button>
          {!offer.available && <p role="status" className="text-sm text-muted-foreground">{t('unavailable')}</p>}
        </CardContent>
      </Card>
    </form>
  )
}
