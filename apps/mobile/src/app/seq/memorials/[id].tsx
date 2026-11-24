import { Stack, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { seqApi, type MemorialView } from '@/api/seq'
import { MemorialQr } from '@/features/seq/MemorialQr'
import { coordinate, memorialInput, memorialValues, useMemorialSpecs } from '@/features/seq/customer'
import { FormFields, useForm } from '@/features/seq/forms'
import { text } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, Heading, Muted, QueryView, Row, Screen, Section, useAction } from '@/ui'

const STATUS_KEY: Record<string, string> = { PENDING: 'pending', PRINTED: 'printed', INSTALLED: 'installed' }

function QrStatus({ memorialId, qrCode }: { memorialId: string; qrCode: NonNullable<MemorialView['qrCode']> }) {
  const t = useT('Memorialized')
  const { run, pending } = useAction()
  const invalidate = useInvalidate('seq')
  const refresh = async () => {
    await invalidate(['memorial', memorialId])
  }
  return (
    <Card>
      <Row className="justify-between">
        <Heading>{t('qr.statusTitle')}</Heading>
        <Badge label={t(`status.${STATUS_KEY[qrCode.status] ?? 'pending'}`)} color={qrCode.status === 'INSTALLED' ? 'success' : qrCode.status === 'PRINTED' ? 'accent' : 'default'} />
      </Row>
      <Muted selectable>{qrCode.url}</Muted>
      {qrCode.printedAt ? <Muted>{t('qr.printedOn', { date: formatDate(qrCode.printedAt) })}</Muted> : null}
      {qrCode.installedAt ? <Muted>{t('qr.installedOn', { date: formatDate(qrCode.installedAt) })}</Muted> : null}
      <Muted>{qrCode.scanCount > 0 ? t('qr.scans', { count: qrCode.scanCount, date: formatDate(qrCode.lastScannedAt) }) : t('qr.noScans')}</Muted>
      {qrCode.status === 'PENDING' ? (
        <Button label={t('qr.markPrinted')} icon="print-outline" variant="secondary" loading={pending} onPress={() => void run(() => seqApi.markQrPrinted(memorialId), { onSuccess: refresh })} fullWidth />
      ) : null}
      {qrCode.status === 'PRINTED' ? (
        <Button label={t('qr.markInstalled')} icon="location-outline" variant="secondary" loading={pending} onPress={() => void run(() => seqApi.markQrInstalled(memorialId), { onSuccess: refresh })} fullWidth />
      ) : null}
    </Card>
  )
}

function EditForm({ view, refresh, refreshing }: { view: MemorialView; refresh: () => Promise<unknown>; refreshing: boolean }) {
  const t = useT('Memorialized')
  const tc = useT('Common')
  const te = useT('Mobile.seq.memorial')
  const invalidate = useInvalidate('seq')
  const form = useForm(memorialValues(view.memorial))
  const specs = useMemorialSpecs()
  const all = [...specs.personal, ...specs.death, ...specs.burial, ...specs.social]
  const id = view.memorial.id

  async function save() {
    const valid = form.validate(all, (values) => ({
      burialLatitude: coordinate(text(values, 'burialLatitude'), 90) === undefined ? te('invalidCoordinate') : undefined,
      burialLongitude: coordinate(text(values, 'burialLongitude'), 180) === undefined ? te('invalidCoordinate') : undefined,
    }))
    if (!valid) return
    await form.submit(() => seqApi.updateDeceased(id, memorialInput(form.values)), {
      success: t('toasts.updated'),
      onSuccess: async () => {
        await invalidate(['memorial', id], ['customer'])
      },
    })
  }

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      footer={<Button label={form.pending ? tc('saving') : t('saveChanges')} onPress={() => void save()} loading={form.pending} fullWidth />}
    >
      {view.qrCode ? <QrStatus memorialId={id} qrCode={view.qrCode} /> : null}
      {view.qr ? (
        <Card>
          <Row className="justify-between">
            <View className="flex-1">
              <Heading>{t('table.qrCode')}</Heading>
              <Muted>{view.qr.name}</Muted>
            </View>
            <MemorialQr name={view.qr.name} customerId={view.qr.customerId} profileId={view.qr.profileId} access={view.qr.access} />
          </Row>
        </Card>
      ) : null}
      <Section title={t('sections.personal')}>
        <FormFields specs={specs.personal} form={form} />
      </Section>
      <Section title={t('sections.death')}>
        <FormFields specs={specs.death} form={form} />
      </Section>
      <Section title={t('sections.burial')}>
        <Muted>{t('burialHint')}</Muted>
        <FormFields specs={specs.burial} form={form} />
      </Section>
      <Section title={t('sections.social')}>
        <FormFields specs={specs.social} form={form} />
      </Section>
    </Screen>
  )
}

export default function SeqMemorialEdit() {
  const params = useLocalSearchParams<{ id: string; customerId?: string }>()
  const id = params.id
  const customerId = params.customerId || undefined
  const query = useView('seq', ['memorial', id, customerId ?? null], () => seqApi.memorial(id, customerId))
  const title = query.data ? `${query.data.memorial.firstName} ${query.data.memorial.lastName}`.trim() : ''
  return (
    <>
      <Stack.Screen options={{ title }} />
      <QueryView query={query}>{(view) => <EditForm view={view} refresh={query.refetch} refreshing={query.isRefetching} />}</QueryView>
    </>
  )
}
