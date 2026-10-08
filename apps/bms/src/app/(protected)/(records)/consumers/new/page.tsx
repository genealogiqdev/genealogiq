import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { verifyConsumerAdmin } from '@/lib/consumer-access'
import { getConsumerForRegistration } from '@/queries/consumers'
import { ConsumerForm } from '@/components/consumers/consumer-form'

export default async function NewConsumerPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await verifyConsumerAdmin()
  const t = await getTranslations('Consumers')
  const { id } = await searchParams
  const initial = typeof id === 'string' ? await getConsumerForRegistration(id) : null
  if (id && !initial) notFound()
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <div className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">{t('newTitle')}</h1>
      <p className="text-muted-foreground">{t('newDescription')}</p>
    </div>
    <ConsumerForm initial={initial} />
  </div>
}
