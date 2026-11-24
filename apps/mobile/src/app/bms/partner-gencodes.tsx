import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { SearchBox } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Button, Card, EmptyState, KeyValue, LinkText, Muted, QueryView, Screen, StatCard, Text } from '@/ui'

export default function PartnerGenCodes() {
  const t = useT('PartnerGenCodes')
  const go = useGo()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const query = useView('bms', ['partnerGencodes', q], () => bmsApi.partnerGencodes(q || undefined))
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen {...refresh}>
        <Muted>{t('description')}</Muted>
        <SearchBox
          value={text}
          onChange={(next) => {
            setText(next)
            if (!next) setQ('')
          }}
          placeholder={t('search')}
          onSubmit={() => setQ(text.trim())}
        />
        <Button label={t('filter')} variant="secondary" icon="search" onPress={() => setQ(text.trim())} />
        <QueryView query={query}>
          {(data) => (
            <View className="gap-3">
              <View className="flex-row flex-wrap gap-3">
                <StatCard label={t('available')} value={formatNumber(data.totals.available)} />
                <StatCard label={t('sold')} value={formatNumber(data.totals.sold)} />
                <StatCard label={t('activated')} value={formatNumber(data.totals.activated)} />
                <StatCard label={t('pending')} value={formatNumber(data.totals.pending)} />
              </View>
              <Muted>{t('countHelp')}</Muted>
              {data.partners.length === 0 ? <EmptyState title={t('empty')} /> : null}
              {data.partners.map((partner) => (
                <Card key={partner.tenantId}>
                  <Text className="font-semibold">{partner.tenantName}</Text>
                  <KeyValue label={t('available')} value={formatNumber(partner.available)} />
                  <KeyValue label={t('sold')} value={formatNumber(partner.sold)} />
                  <KeyValue label={t('activated')} value={formatNumber(partner.activated)} />
                  <KeyValue label={t('pending')} value={formatNumber(partner.pending)} />
                  <KeyValue label={t('lastSale')} value={partner.lastSaleAt ? formatDate(partner.lastSaleAt) : '—'} />
                  <LinkText label={t('viewCustomers')} onPress={() => go.push('/bms/customers', { segment: 'consumers', tenant: partner.tenantId })} />
                </Card>
              ))}
            </View>
          )}
        </QueryView>
      </Screen>
    </>
  )
}
