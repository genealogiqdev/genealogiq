import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi, type GenCodeStatus, type LicenseRow } from '@/api/seq'
import { ListScreen } from '@/features/seq/ListScreen'
import { formatGenCode, fullName } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDate, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Field, Muted, Row, Segmented, StatCard, Text } from '@/ui'

type Filter = 'ALL' | GenCodeStatus

const STATUS_COLOR: Record<GenCodeStatus, 'success' | 'warning' | 'accent'> = {
  AVAILABLE: 'success',
  SOLD: 'warning',
  ACTIVATED: 'accent',
}

const oneLine = (label: string) => label.replace(/\n/g, ' ')

export default function SeqGenCodes() {
  const t = useT('Licenses')
  const tc = useT('Mobile.common')
  const tb = useT('BusinessCustomers')
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const status = filter === 'ALL' ? undefined : filter
  const query = useView('seq', ['activations', filter], () => seqApi.activations(status), { placeholderData: (previous) => previous })

  const needle = search.trim().toUpperCase().replace(/-/g, '')
  const matches = (row: LicenseRow) =>
    !needle ||
    row.genCode.toUpperCase().includes(needle) ||
    `${row.soldToName ?? ''} ${fullName(row.soldToAppUser)} ${fullName(row.appUser)}`.toUpperCase().includes(needle)

  return (
    <ListScreen
      query={query}
      items={(data) => data.licenses.filter(matches)}
      keyOf={(row) => row.id}
      emptyTitle={t('table.empty')}
      emptyIcon="qr-code-outline"
      header={(data) => (
        <>
          <View className="flex-row flex-wrap gap-3">
            <StatCard label={oneLine(t('summary.available'))} value={formatNumber(data.summary.available)} />
            <StatCard label={oneLine(t('summary.sold'))} value={formatNumber(data.summary.sold)} />
            <StatCard label={oneLine(t('summary.activated'))} value={formatNumber(data.summary.activated)} />
          </View>
          <Button label={tb('stockPrintTitle')} icon="print-outline" variant="secondary" onPress={() => router.push('/seq/gencodes/print-batch')} fullWidth />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: tc('all') },
              { value: 'AVAILABLE', label: t('status.AVAILABLE') },
              { value: 'SOLD', label: t('status.SOLD') },
              { value: 'ACTIVATED', label: t('status.ACTIVATED') },
            ]}
          />
          <Field value={search} onChangeText={setSearch} placeholder={tc('search')} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={tc('search')} />
          <View />
        </>
      )}
      renderItem={(row) => {
        const soldTo = fullName(row.soldToAppUser) || row.soldToName
        const memorial = fullName(row.appUser)
        return (
          <Card onPress={() => router.push(`/seq/gencodes/${encodeURIComponent(row.genCode)}`)}>
            <Row className="justify-between">
              <Text className="font-mono font-semibold">{formatGenCode(row.genCode)}</Text>
              <Badge label={t(`status.${row.status}`)} color={STATUS_COLOR[row.status] ?? 'default'} />
            </Row>
            {soldTo ? <Muted>{`${t('table.soldTo')}: ${soldTo}${row.soldAt ? ` · ${formatDate(row.soldAt)}` : ''}`}</Muted> : null}
            {memorial ? <Muted>{`${t('table.memorial')}: ${memorial}`}</Muted> : null}
            {row.activatedAt ? <Muted>{`${t('table.activated')}: ${formatDate(row.activatedAt)}`}</Muted> : null}
          </Card>
        )
      }}
    />
  )
}
