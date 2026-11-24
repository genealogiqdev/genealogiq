import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi, type BusinessCodeRow, type BusinessCodeState } from '@/api/seq'
import { ListScreen } from '@/features/seq/ListScreen'
import { FormFields, useForm, type Spec } from '@/features/seq/forms'
import { formatGenCode, text } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { qrSvg } from '@/lib/qr'
import { useInvalidate, useView } from '@/lib/query'
import { shareFile } from '@/lib/share'
import { Badge, Button, Card, Field, LinkText, Muted, Row, Segmented, Sheet, Text, useAction, useNotify } from '@/ui'

type Filter = 'all' | 'available' | 'assigned' | 'activated' | 'expired'

const STATE_COLOR: Record<BusinessCodeState, 'success' | 'accent' | 'warning' | 'danger' | 'default'> = {
  available: 'success',
  assigned: 'warning',
  activated: 'accent',
  expired: 'danger',
  returned: 'default',
}

function DeliverSheet({ customerId, code, onClose }: { customerId: string; code: BusinessCodeRow; onClose: () => void }) {
  const t = useT('BusinessCustomers')
  const invalidate = useInvalidate('seq')
  const form = useForm({ firstName: '', lastName: '', email: '' })
  const specs: Spec[] = [
    { key: 'firstName', label: t('firstName'), required: true, max: 100 },
    { key: 'lastName', label: t('lastName'), required: true, max: 100 },
    { key: 'email', label: t('fields.email'), kind: 'email', required: true },
  ]

  async function submit() {
    if (!form.validate(specs)) return
    await form.submit(
      () =>
        seqApi.deliverBusinessGenCode(customerId, {
          genCode: code.genCode,
          firstName: text(form.values, 'firstName'),
          lastName: text(form.values, 'lastName'),
          email: text(form.values, 'email').toLowerCase(),
        }),
      {
        success: true,
        onSuccess: async () => {
          onClose()
          await invalidate(['businessCustomer', customerId], ['businessCustomers'], ['customers'], ['activations'])
        },
      },
    )
  }

  return (
    <Sheet visible onClose={() => (form.pending ? undefined : onClose())} title={`${t('deliverCode')}: ${formatGenCode(code.genCode)}`}>
      <Muted>{t('deliveryHelp')}</Muted>
      <FormFields specs={specs} form={form} />
      <Button label={form.pending ? t('saving') : t('confirmDelivery')} onPress={() => void submit()} loading={form.pending} fullWidth />
    </Sheet>
  )
}

export default function SeqBusinessCodes() {
  const t = useT('BusinessCustomers')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const notify = useNotify()
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['businessCustomer', id], () => seqApi.businessCustomer(id))
  const resend = useAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BusinessCodeRow | null>(null)
  const needle = search.trim().toUpperCase().replace(/-/g, '')

  async function shareSvg(code: BusinessCodeRow) {
    try {
      await shareFile(`${code.genCode}.svg`, qrSvg(code.url), { mimeType: 'image/svg+xml' })
    } catch {
      notify.error(t('qrFailed'))
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t('inventoryTitle') }} />
      <ListScreen
        query={query}
        items={(data) => data.codes.filter((code) => (filter === 'all' || code.state === filter) && (!needle || code.genCode.toUpperCase().includes(needle)))}
        keyOf={(code) => `${code.saleId}:${code.genCode}`}
        emptyTitle={t('noCodes')}
        emptyIcon="qr-code-outline"
        header={(data) => (
          <>
            <Muted>{t('inventoryHelp')}</Muted>
            {data.company.isActive ? null : <Muted>{t('inactive')}</Muted>}
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('allCodes') },
                { value: 'available', label: t('codeStates.available') },
                { value: 'assigned', label: t('codeStates.assigned') },
                { value: 'activated', label: t('codeStates.activated') },
                { value: 'expired', label: t('codeStates.expired') },
              ]}
            />
            <Field value={search} onChangeText={setSearch} placeholder={tc('search')} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={tc('search')} />
            <View />
          </>
        )}
        renderItem={(code, data) => (
          <Card>
            <Row className="justify-between">
              <Text className="font-mono font-semibold">{formatGenCode(code.genCode)}</Text>
              <Badge label={t(`codeStates.${code.state}`)} color={STATE_COLOR[code.state] ?? 'default'} />
            </Row>
            {code.expiresAt ? <Muted>{formatDate(code.expiresAt)}</Muted> : null}
            {code.recipient ? (
              <View>
                <Muted>{t('recipient')}</Muted>
                <LinkText label={code.recipient.name} onPress={() => router.push(`/seq/customers/${code.recipient?.id}`)} />
                {code.recipient.email ? <Muted>{code.recipient.email}</Muted> : null}
              </View>
            ) : null}
            <View className="gap-2">
              {code.state === 'available' && data.canDeliver ? (
                <Button label={t('deliverCode')} icon="send-outline" onPress={() => setSelected(code)} disabled={!data.company.isActive} fullWidth />
              ) : null}
              {code.recipient ? (
                <Button
                  label={t('resendAccess')}
                  icon="mail-outline"
                  variant="secondary"
                  disabled={resend.pending}
                  onPress={() => void resend.run(() => seqApi.resendBusinessGenCode(data.company.id, code.genCode), { success: true })}
                  fullWidth
                />
              ) : null}
              <Button label={t('downloadQr')} icon="share-outline" variant="ghost" onPress={() => void shareSvg(code)} fullWidth />
            </View>
          </Card>
        )}
      />
      {selected ? <DeliverSheet customerId={id} code={selected} onClose={() => setSelected(null)} /> : null}
    </>
  )
}
