import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ConsumersList } from '@/features/bms/ConsumersList'
import { PartnersList } from '@/features/bms/PartnersList'
import { useMe } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { QueryView, Segmented } from '@/ui'

type Segment = 'partners' | 'consumers'

export default function Customers() {
  const t = useT('Mobile.bms')
  const me = useMe()
  const params = useLocalSearchParams<{ segment?: string; tenant?: string }>()
  const [segment, setSegment] = useState<Segment>(params.segment === 'consumers' ? 'consumers' : 'partners')
  useEffect(() => {
    if (params.segment === 'consumers' || params.segment === 'partners') setSegment(params.segment)
  }, [params.segment, params.tenant])

  return (
    <QueryView query={me}>
      {(data) => {
        // The directory of final customers exists only for platform administrators.
        const switcher = data.isConsumerAdmin ? (
          <Segmented<Segment>
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'partners', label: t('segments.partners') },
              { value: 'consumers', label: t('segments.consumers') },
            ]}
          />
        ) : null
        return data.isConsumerAdmin && segment === 'consumers' ? (
          <ConsumersList top={switcher} initialTenant={typeof params.tenant === 'string' ? params.tenant : undefined} />
        ) : (
          <PartnersList top={switcher} />
        )
      }}
    </QueryView>
  )
}
