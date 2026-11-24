import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi, type CustomerView } from '@/api/seq'
import { MemorialQr } from '@/features/seq/MemorialQr'
import { Notice } from '@/features/seq/forms'
import { uuid } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, Divider, EmptyState, Field, Heading, KeyValue, ListRow, Muted, QueryView, Row, Screen, Section, Sheet, StatCard, Text, confirm, useAction } from '@/ui'

const oneLine = (label: string) => label.replace(/\n/g, ' ')

function SellCodeSheet({ customerId, name, onClose, onDone }: { customerId: string; name: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const t = useT('PremiumAccess')
  const te = useT('Errors')
  const [genCode, setGenCode] = useState('')
  const [requestId] = useState(uuid)
  const [error, setError] = useState<string | null>(null)
  const { run, pending } = useAction()

  async function submit() {
    const code = genCode.trim().toUpperCase()
    if (!code) {
      setError(te('required'))
      return
    }
    setError(null)
    await run(() => seqApi.sellCustomerGenCode(customerId, code, requestId), {
      success: true,
      onSuccess: async () => {
        onClose()
        await onDone()
      },
    })
  }

  return (
    <Sheet visible onClose={() => (pending ? undefined : onClose())} title={t('recordSale')}>
      <Muted>{t('existingSaleDescription', { name })}</Muted>
      <Field
        label={t('code')}
        value={genCode}
        onChangeText={(value) => setGenCode(value.toUpperCase())}
        maxLength={64}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        hint={t('existingSaleHelp')}
        error={error}
        autoCapitalize="characters"
        autoCorrect={false}
        disabled={pending}
      />
      <Button label={t(pending ? 'saving' : 'confirmSale')} onPress={() => void submit()} loading={pending} fullWidth />
    </Sheet>
  )
}

function AccessPanel({ view, onChanged }: { view: CustomerView; onChanged: () => Promise<unknown> }) {
  const t = useT('PremiumAccess')
  const tc = useT('Customers')
  const { run, pending } = useAction()
  const [requestId, setRequestId] = useState(uuid)
  const [selling, setSelling] = useState(false)
  const { access, customer } = view
  if (!access) return null
  const name = `${customer.firstName} ${customer.lastName}`.trim()
  const grantId = access.grantId

  async function toggle() {
    const accepted = await confirm({
      title: t(grantId ? 'deactivateTitle' : 'activateTitle'),
      message: `${t(grantId ? 'deactivateDescription' : 'activateDescription', { name })}\n\n${t('stockUnchanged')}`,
      confirmLabel: t(grantId ? 'deactivate' : 'activate'),
      cancelLabel: t('cancel'),
      destructive: !!grantId,
    })
    if (!accepted) return
    await run(() => (grantId ? seqApi.revokeCustomerPremium(customer.id, grantId) : seqApi.grantCustomerPremium(customer.id, requestId)), {
      success: true,
      onSuccess: async () => {
        setRequestId(uuid())
        await onChanged()
      },
    })
  }

  return (
    <Card>
      <Heading>{t('onboardingTitle')}</Heading>
      <Row className="flex-wrap">
        <Badge label={access.planName} color={access.planCode === 'PREMIUM' ? 'accent' : 'default'} />
        {access.expiresAt ? <Muted>{tc('premiumUntil', { date: formatDate(access.expiresAt, { utc: true }) })}</Muted> : null}
      </Row>
      <Muted>{t('soldCount', { count: view.stats.acquiredQrCodes })}</Muted>
      {view.canManageAccess ? (
        <View className="gap-2 pt-1">
          {grantId || view.canGrant ? (
            <Button
              label={t(pending ? 'saving' : grantId ? 'deactivate' : 'activate')}
              variant={grantId ? 'danger-soft' : 'primary'}
              icon={grantId ? 'close-circle-outline' : 'star-outline'}
              onPress={() => void toggle()}
              loading={pending}
              fullWidth
            />
          ) : (
            <Muted>{t('errors.customer-unavailable')}</Muted>
          )}
          {view.canGrant ? <Button label={t('recordSale')} icon="qr-code-outline" variant="secondary" onPress={() => setSelling(true)} disabled={pending} fullWidth /> : null}
        </View>
      ) : (
        <Muted>{t('adminRequired')}</Muted>
      )}
      {selling ? <SellCodeSheet customerId={customer.id} name={name} onClose={() => setSelling(false)} onDone={onChanged} /> : null}
    </Card>
  )
}

function Detail({ view, refresh, refreshing }: { view: CustomerView; refresh: () => Promise<unknown>; refreshing: boolean }) {
  const t = useT('Customers')
  const tm = useT('Memorialized')
  const tc = useT('Common')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const { run, pending } = useAction()
  const { customer, memorialQuota: quota } = view
  const name = `${customer.firstName} ${customer.lastName}`.trim()
  const category = view.categories.find((entry) => entry.id === customer.categoryId)

  const changed = () => invalidate(['customer', customer.id], ['customers'], ['activations'], ['dashboard'])

  async function remove() {
    const accepted = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name })}\n\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await run(() => seqApi.deleteCustomer(customer.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['customers'], ['dashboard'])
        router.back()
      },
    })
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <Card>
        <Row className="justify-between">
          <Heading className="flex-1">{name}</Heading>
          <Badge label={t(customer.isActive ? 'status.active' : 'status.inactive')} color={customer.isActive ? 'success' : 'danger'} />
        </Row>
        <KeyValue label={t('table.email')} value={customer.email ?? ''} />
        <KeyValue label={oneLine(t('fields.phone'))} value={customer.phone ? `+${customer.phoneCountryCode} ${customer.phone}` : ''} />
        <KeyValue label={oneLine(t('fields.birthDate'))} value={formatDate(customer.birthDate, { utc: true })} />
        {category ? <KeyValue label={oneLine(t('fields.category'))} value={category.name} /> : null}
        {customer.notes ? <Muted>{customer.notes}</Muted> : null}
      </Card>

      <AccessPanel view={view} onChanged={changed} />

      <Card>
        <ListRow title={t('actions.edit')} icon="create-outline" onPress={() => router.push(`/seq/customers/${customer.id}/edit`)} />
        <Divider />
        <ListRow
          title={t(customer.isActive ? 'actions.deactivate' : 'actions.reactivate')}
          icon={customer.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
          chevron={false}
          onPress={
            pending
              ? undefined
              : () =>
                  void run(() => seqApi.toggleCustomerActive(customer.id), {
                    success: t(customer.isActive ? 'toasts.deactivated' : 'toasts.reactivated'),
                    onSuccess: async () => {
                      await changed()
                    },
                  })
          }
        />
        <Divider />
        <ListRow
          title={t('actions.resendEmail')}
          icon="mail-outline"
          chevron={false}
          onPress={pending ? undefined : () => void run(() => seqApi.resendCustomerEmail(customer.id), { success: t('toasts.emailResent') })}
        />
        <Divider />
        <ListRow title={t('actions.delete')} icon="trash-outline" destructive chevron={false} onPress={pending ? undefined : () => void remove()} />
      </Card>

      <Section title={t('memorialized.title')}>
        <Muted>{t('memorialized.description')}</Muted>
        <View className="flex-row flex-wrap gap-3">
          <StatCard label={oneLine(t('memorialized.acquiredQrCodesLabel'))} value={view.stats.acquiredQrCodes} />
          <StatCard label={oneLine(t('memorialized.availableProfilesLabel'))} value={view.stats.availableProfiles} />
          <StatCard label={oneLine(t('memorialized.createdProfilesLabel'))} value={view.stats.createdProfiles} />
        </View>
        <Notice>
          {t('memorialized.planUsage', {
            plan: quota.planName,
            humans: quota.humans.count,
            humanLimit: quota.humans.limit,
            pets: quota.pets.count,
            petLimit: quota.pets.limit,
          })}
          {quota.planCode === 'FREE' ? `\n${t('memorialized.freeQrHint')}` : ''}
          {quota.planCode === 'PREMIUM' ? `\n${t('memorialized.premiumQrHint')}` : ''}
        </Notice>
        {view.memorials.length === 0 ? (
          <EmptyState title={tm('table.empty')} icon="flower-outline" />
        ) : (
          view.memorials.map((memorial) => {
            const memorialName = `${memorial.firstName} ${memorial.lastName}`.trim()
            return (
              <Card key={memorial.id}>
                <Row className="justify-between">
                  <Text className="flex-1 font-semibold">{memorialName}</Text>
                  <Badge label={tm(memorial.role === 'APP_PET' ? 'table.pet' : 'table.human')} />
                </Row>
                <Muted>{`${formatDate(memorial.birthDate, { utc: true }) || '—'} – ${formatDate(memorial.deathDate, { utc: true }) || '—'}`}</Muted>
                <Row className="flex-wrap justify-between">
                  <Button
                    label={tm('actions.edit')}
                    icon="create-outline"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push({ pathname: '/seq/memorials/[id]', params: { id: memorial.id, customerId: memorial.customerId } })}
                  />
                  <MemorialQr name={memorialName} customerId={memorial.customerId} profileId={memorial.id} access={memorial.qrAccess} />
                </Row>
              </Card>
            )
          })
        )}
      </Section>
    </Screen>
  )
}

export default function SeqCustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['customer', id], () => seqApi.customer(id))
  const title = query.data ? `${query.data.customer.firstName} ${query.data.customer.lastName}`.trim() : ''
  return (
    <>
      <Stack.Screen options={{ title }} />
      <QueryView query={query}>{(view) => <Detail view={view} refresh={query.refetch} refreshing={query.isRefetching} />}</QueryView>
    </>
  )
}
