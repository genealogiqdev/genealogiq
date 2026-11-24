import { Stack, useLocalSearchParams } from 'expo-router'
import { bmsApi } from '@/api/bms'
import { ConsumerForm } from '@/features/bms/ConsumerForm'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Muted, QueryView, Screen } from '@/ui'

export default function ConsumerNew() {
  const t = useT('Consumers')
  const { id } = useLocalSearchParams<{ id?: string }>()
  const prefill = typeof id === 'string' && id ? id : undefined
  const query = useView('bms', ['consumerNew', prefill ?? ''], () => bmsApi.consumerNew(prefill))
  return (
    <>
      <Stack.Screen options={{ title: t('newTitle') }} />
      <QueryView query={query}>
        {(data) => (
          <Screen>
            <Muted>{t('newDescription')}</Muted>
            <ConsumerForm key={prefill ?? 'new'} initial={data.initial} />
          </Screen>
        )}
      </QueryView>
    </>
  )
}
