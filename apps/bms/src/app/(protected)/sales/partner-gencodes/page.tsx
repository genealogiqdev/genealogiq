import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPartnerGenCodeOverview } from '@/queries/partner-gencodes'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@genealogiq/ui/table'

export default async function PartnerGenCodesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams
  const { partners, totals, search } = await getPartnerGenCodeOverview(typeof params.q === 'string' ? params.q : '')
  const t = await getTranslations('PartnerGenCodes')
  const date = new Intl.DateTimeFormat(await getLocale(), { dateStyle: 'short', timeZone: 'UTC' })
  return <div className="space-y-6">
    <div className="space-y-2"><h1 className="text-4xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p></div>
    <form action="/sales/partner-gencodes" method="get" className="flex flex-wrap gap-2">
      <Input name="q" aria-label={t('search')} placeholder={t('search')} defaultValue={search} maxLength={320} className="sm:max-w-md" />
      <Button type="submit" variant="outline">{t('filter')}</Button>
      {search && <Button asChild variant="ghost"><Link href="/sales/partner-gencodes">{t('clear')}</Link></Button>}
    </form>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(['available', 'sold', 'activated', 'pending'] as const).map((key) => <Card key={key}>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t(key)}</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold tabular-nums">{totals[key]}</p></CardContent>
      </Card>)}
    </div>
    <p className="text-sm text-muted-foreground">{t('countHelp')}</p>
    <div className="rounded-lg border"><Table>
      <TableHeader><TableRow><TableHead>{t('partner')}</TableHead>
        <TableHead className="text-right">{t('available')}</TableHead><TableHead className="text-right">{t('sold')}</TableHead>
        <TableHead className="text-right">{t('activated')}</TableHead><TableHead className="text-right">{t('pending')}</TableHead>
        <TableHead>{t('lastSale')}</TableHead><TableHead>{t('customers')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>{partners.map((partner) => <TableRow key={partner.tenantId}>
        <TableCell className="max-w-64 whitespace-normal font-medium"><Link href={`/customers/${encodeURIComponent(partner.tenantId)}`} className="underline underline-offset-4">{partner.tenantName}</Link></TableCell>
        <TableCell className="text-right tabular-nums">{partner.available}</TableCell>
        <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{partner.sold}</TableCell>
        <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{partner.activated}</TableCell>
        <TableCell className="text-right tabular-nums">{partner.pending}</TableCell>
        <TableCell>{partner.lastSaleAt ? date.format(partner.lastSaleAt) : '—'}</TableCell>
        <TableCell><Button asChild variant="outline" size="sm"><Link href={`/consumers?tenant=${encodeURIComponent(partner.tenantId)}`}>{t('viewCustomers')}</Link></Button></TableCell>
      </TableRow>)}
        {!partners.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t('empty')}</TableCell></TableRow>}
      </TableBody>
    </Table></div>
  </div>
}
