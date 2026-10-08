import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@genealogiq/ui/table'
import { getConsumers } from '@/queries/consumers'
import { ConsumerResendButton } from '@/components/consumers/consumer-resend-button'

export default async function ConsumersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q : ''
  const data = await getConsumers(query, Number(params.page ?? 1))
  const t = await getTranslations('Consumers')
  const date = new Intl.DateTimeFormat(await getLocale(), { dateStyle: 'medium', timeZone: 'UTC' })
  const pageHref = (page: number) => `/consumers?${new URLSearchParams({ q: query, page: String(page) })}`
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <Button asChild><Link href="/consumers/new">{t('new')}</Link></Button>
    </div>
    <form action="/consumers" className="flex max-w-lg gap-2">
      <Input name="q" aria-label={t('search')} placeholder={t('search')} defaultValue={query} maxLength={320} />
      <Button variant="outline" type="submit">{t('searchButton')}</Button>
    </form>
    <div className="rounded-lg border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t('name')}</TableHead><TableHead>{t('email')}</TableHead>
          <TableHead>{t('access')}</TableHead><TableHead>{t('delivery')}</TableHead><TableHead>{t('actions')}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.consumers.map((consumer) => {
            const active = consumer.appSales[0]
            const gift = consumer.consumerAccessGrants[0]
            const liveGift = !!gift && gift.expiresAt > new Date()
            return <TableRow key={consumer.id}>
              <TableCell className="max-w-48 whitespace-normal break-words font-medium">{consumer.firstName} {consumer.lastName}</TableCell>
              <TableCell className="max-w-56 whitespace-normal break-all">{consumer.email}</TableCell>
              <TableCell className="max-w-48 whitespace-normal">{!consumer.isActive ? t('inactive') : active?.currentPeriodEnd
                ? <><span className="font-medium">{active.subscription.name}</span><p className="text-xs text-muted-foreground">{t('until', { date: date.format(active.currentPeriodEnd) })}</p></>
                : t('free')}</TableCell>
              <TableCell>{gift ? t(gift.emailSentAt ? 'sent' : 'pending') : '—'}</TableCell>
              <TableCell>{consumer.isActive && (liveGift
                ? <ConsumerResendButton appUserId={consumer.id} />
                : <Button asChild variant="outline" size="sm"><Link href={`/consumers/new?id=${encodeURIComponent(consumer.id)}`}>{t('grant')}</Link></Button>)}</TableCell>
            </TableRow>
          })}
          {!data.consumers.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{t('empty')}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>{t('pagination', { page: data.page, pages: data.pages, total: data.total })}</p>
      <div className="flex gap-2">
        {data.page > 1 && <Button asChild variant="outline" size="sm"><Link href={pageHref(data.page - 1)}>{t('previous')}</Link></Button>}
        {data.page < data.pages && <Button asChild variant="outline" size="sm"><Link href={pageHref(data.page + 1)}>{t('next')}</Link></Button>}
      </div>
    </div>
  </div>
}
