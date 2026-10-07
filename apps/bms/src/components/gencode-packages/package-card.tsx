'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Badge } from '@genealogiq/ui/badge'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Separator } from '@genealogiq/ui/separator'
import type { GenCodePackageRow } from '@/queries/gencode-packages'
import { syncGenCodePackageWithStripe } from '@/actions/gencode-package.actions'

export function GenCodePackageCard({ packageRow }: { packageRow: GenCodePackageRow }) {
  const t = useTranslations('GenCodePackages')
  const locale = useLocale()
  const [syncing, startSync] = useTransition()
  const isSynced = !!packageRow.stripeProductId && !!packageRow.stripePriceId
  const unitPrice = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: packageRow.currency,
  }).format(packageRow.unitPrice)

  function handleSync() {
    startSync(async () => {
      const result = await syncGenCodePackageWithStripe(packageRow.id)
      if (!result.ok) toast.error(result.message)
      else toast.success(result.message)
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-xl">{packageRow.name}</CardTitle>
        <Badge variant={packageRow.isActive ? 'default' : 'secondary'}>
          {packageRow.isActive ? t('product.active') : t('product.inactive')}
        </Badge>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('product.unitPrice')}</p>
            <p className="text-2xl font-bold tabular-nums">{unitPrice}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('product.minimum')}</p>
            <p className="text-2xl font-bold tabular-nums">
              {t('product.units', { count: packageRow.minimumQuantity })}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('product.validity')}</p>
            <p className="text-2xl font-bold">{t('product.validityValue')}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t('product.description')}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{t('product.stripe')}: </span>
            <span className={isSynced ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
              {isSynced ? t('product.synced') : t('product.notSynced')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={syncing} onClick={handleSync}>
              {syncing ? t('product.syncing') : t('product.sync')}
            </Button>
            {packageRow.isActive ? (
              <Button asChild>
                <Link href={`/gencodes/new?packageId=${encodeURIComponent(packageRow.id)}`}>
                  {t('newOrder')}
                </Link>
              </Button>
            ) : (
              <Button disabled>{t('newOrder')}</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

