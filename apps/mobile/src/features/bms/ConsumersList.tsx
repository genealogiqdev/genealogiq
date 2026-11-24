import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { bmsApi, type ConsumerRow, type ConsumersParams, type PartnerOption } from '@/api/bms'
import { useT } from '@/i18n'
import { formatDate, formatNumber } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, EmptyState, KeyValue, Muted, QueryView, Row, Screen, SelectField, Sheet, Text, confirm, useAction } from '@/ui'
import { SearchBox, StatusBadge } from './fields'
import { useGo, useRefresh, uuid } from './lib'

type Status = NonNullable<ConsumersParams['status']>

const partnerLabel = (partner: PartnerOption) =>
  partner.tradeName && partner.tradeName !== partner.name ? `${partner.tradeName} (${partner.name})` : partner.name

function ConsumerCard({ row, partners }: { row: ConsumerRow; partners: PartnerOption[] }) {
  const t = useT('Consumers')
  const tp = useT('PremiumAccess')
  const tl = useT('ConsumerPartner')
  const go = useGo()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const [linking, setLinking] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const name = `${row.firstName} ${row.lastName}`.trim()
  const done = () => invalidate(['consumers'], ['partnerGencodes'])
  const { capabilities } = row
  const premium = capabilities.partnerPremium

  async function revokeGift(grantId: string) {
    const yes = await confirm({
      title: t('revokeTitle'),
      message: t('revokeDescription', { name }),
      confirmLabel: t('revoke'),
      cancelLabel: t('keepPremium'),
      destructive: true,
    })
    if (yes) await action.run(() => bmsApi.revokeConsumerAccess(grantId), { success: true, onSuccess: done })
  }

  async function grantPartner() {
    const yes = await confirm({
      title: tp('activateTitle'),
      message: `${tp('activateDescription', { name })}\n\n${tp('stockUnchanged')}`,
      confirmLabel: tp('activate'),
      cancelLabel: tp('cancel'),
    })
    if (yes) await action.run(() => bmsApi.grantPartnerPremium(row.id, uuid()), { success: true, onSuccess: done })
  }

  async function revokePartner(grantId: string) {
    const yes = await confirm({
      title: tp('deactivateTitle'),
      message: `${tp('deactivateDescription', { name })}\n\n${tp('stockUnchanged')}`,
      confirmLabel: tp('deactivate'),
      cancelLabel: tp('cancel'),
      destructive: true,
    })
    if (yes) await action.run(() => bmsApi.revokePartnerPremium(row.id, grantId), { success: true, onSuccess: done })
  }

  async function link() {
    const partner = partners.find((entry) => entry.id === partnerId)
    if (!partner) return
    const yes = await confirm({
      title: tl('title'),
      message: `${tl('confirmDescription', { name, partner: partnerLabel(partner) })}\n\n${tl('preserved')}`,
      confirmLabel: tl('confirm'),
      cancelLabel: tl('cancel'),
    })
    if (!yes) return
    await action.run(() => bmsApi.linkConsumerPartner(row.id, partner.id), {
      success: true,
      onSuccess: async () => {
        setLinking(false)
        await done()
      },
    })
  }

  return (
    <Card>
      <Row className="justify-between">
        <Text className="flex-1 font-semibold" numberOfLines={2}>
          {name}
        </Text>
        <StatusBadge active={row.isActive} />
      </Row>
      <Muted>{row.email ?? t('noEmail')}</Muted>
      <KeyValue label={t('partner')} value={row.tenant ? partnerLabel(row.tenant) : t('noPartner')} />
      <KeyValue label={t('createdAt')} value={formatDate(row.createdAt, { utc: true })} />
      <KeyValue
        label={t('access')}
        value={row.access ? `${row.access.planName} · ${t('until', { date: formatDate(row.access.until, { utc: true }) })}` : t('free')}
      />
      {row.gift ? (
        <KeyValue
          label={t('delivery')}
          value={
            row.gift.revokedAt ? (
              <Text className="flex-1 text-right text-sm text-muted">{t('giftRevoked', { date: formatDate(row.gift.revokedAt, { utc: true }) })}</Text>
            ) : (
              <Badge label={row.gift.emailSentAt ? t('sent') : t('pending')} color={row.gift.emailSentAt ? 'success' : 'warning'} />
            )
          }
        />
      ) : null}
      <KeyValue label={t('genCodesSold')} value={formatNumber(row.genCodesSold)} />

      <View className="flex-row flex-wrap gap-2 pt-1">
        {capabilities.grantDirect ? <Button size="sm" label={t('grant')} onPress={() => go.push('/bms/consumers/new', { id: row.id })} /> : null}
        {capabilities.resendAccess ? (
          <Button size="sm" variant="secondary" label={t('resend')} disabled={action.pending} onPress={() => void action.run(() => bmsApi.resendConsumerAccessEmail(row.id), { success: true, onSuccess: done })} />
        ) : null}
        {capabilities.revokeDirectGrantId ? (
          <Button size="sm" variant="danger-soft" label={t('revoke')} disabled={action.pending} onPress={() => void revokeGift(capabilities.revokeDirectGrantId!)} />
        ) : null}
        {premium?.revokeGrantId ? (
          <Button size="sm" variant="danger-soft" label={tp('deactivate')} disabled={action.pending} onPress={() => void revokePartner(premium.revokeGrantId!)} />
        ) : premium?.canGrant ? (
          <Button size="sm" variant="secondary" label={tp('activate')} disabled={action.pending} onPress={() => void grantPartner()} />
        ) : null}
        {capabilities.linkPartner ? (
          <Button
            size="sm"
            variant="outline"
            label={tl('trigger')}
            onPress={() => {
              setPartnerId('')
              setLinking(true)
            }}
          />
        ) : null}
      </View>

      <Sheet visible={linking} onClose={() => (action.pending ? undefined : setLinking(false))} title={tl('title')}>
        <Muted>{tl('description', { name })}</Muted>
        {partners.length === 0 ? <Muted>{tl('empty')}</Muted> : null}
        <SelectField
          label={tl('partner')}
          placeholder={tl('placeholder')}
          value={partnerId}
          options={partners.map((partner) => ({ value: partner.id, label: partnerLabel(partner) }))}
          onChange={setPartnerId}
          searchable
        />
        <Button label={action.pending ? tl('saving') : tl('confirm')} onPress={() => void link()} disabled={!partnerId} loading={action.pending} />
      </Sheet>
    </Card>
  )
}

/** Global APP customer directory (platform administrators only). */
export function ConsumersList({ top, initialTenant }: { top?: ReactElement | null; initialTenant?: string }) {
  const t = useT('Consumers')
  const go = useGo()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [tenant, setTenant] = useState(initialTenant ?? '')
  const [page, setPage] = useState(1)
  useEffect(() => {
    setTenant(initialTenant ?? '')
    setPage(1)
  }, [initialTenant])

  const query = useView('bms', ['consumers', q, status, tenant, page], () => bmsApi.consumers({ q, status, tenant, page }))
  const refresh = useRefresh(query)
  const partners = query.data?.partners ?? []

  function search() {
    setQ(text.trim())
    setPage(1)
  }

  return (
    <Screen {...refresh}>
      {top}
      <Muted>{t('description')}</Muted>
      <SearchBox
        value={text}
        onChange={(next) => {
          setText(next)
          if (!next && q) {
            setQ('')
            setPage(1)
          }
        }}
        placeholder={t('search')}
        onSubmit={search}
      />
      <SelectField<Status>
        label={t('status')}
        value={status}
        options={[
          { value: 'all', label: t('allStatuses') },
          { value: 'active', label: t('active') },
          { value: 'inactive', label: t('inactive') },
        ]}
        onChange={(next) => {
          setStatus(next)
          setPage(1)
        }}
      />
      <SelectField
        label={t('partner')}
        value={tenant}
        placeholder={t('allPartners')}
        options={partners.map((partner) => ({ value: partner.id, label: partnerLabel(partner) }))}
        onChange={(next) => {
          setTenant(next)
          setPage(1)
        }}
        searchable
        clearLabel={t('allPartners')}
        onClear={() => {
          setTenant('')
          setPage(1)
        }}
      />
      <Row>
        <View className="flex-1">
          <Button label={t('searchButton')} variant="secondary" icon="search" onPress={search} />
        </View>
        <View className="flex-1">
          <Button label={t('new')} icon="add" onPress={() => go.push('/bms/consumers/new')} />
        </View>
      </Row>

      <QueryView query={query}>
        {(data) => (
          <View className="gap-3">
            {data.consumers.length === 0 ? <EmptyState title={t('empty')} icon="people-outline" /> : null}
            {data.consumers.map((row) => (
              <ConsumerCard key={row.id} row={row} partners={data.partners} />
            ))}
            <Muted className="text-center">{t('pagination', { page: data.page, pages: Math.max(1, data.pages), total: data.total })}</Muted>
            <Row>
              <View className="flex-1">
                <Button label={t('previous')} variant="outline" disabled={data.page <= 1} onPress={() => setPage(data.page - 1)} />
              </View>
              <View className="flex-1">
                <Button label={t('next')} variant="outline" disabled={data.page >= data.pages} onPress={() => setPage(data.page + 1)} />
              </View>
            </Row>
          </View>
        )}
      </QueryView>
    </Screen>
  )
}
