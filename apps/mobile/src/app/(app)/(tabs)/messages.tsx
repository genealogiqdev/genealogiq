import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text as RNText, View } from 'react-native'
import { appApi, type ActivityCursor, type InboxItem } from '@/api/app'
import type { ActionResponse } from '@/api/client'
import { useT, type Translate } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Avatar, Button, Card, EmptyState, Muted, QueryView, Row, Screen, Section, Text, useAction, useNotify } from '@/ui'

const strong = (chunks: unknown) => <RNText className="font-semibold text-foreground">{chunks as ReactNode}</RNText>

function relationKey(type: string, subtype: string | null, requesterIsParent: boolean): string {
  if (type === 'SPOUSE') return subtype === 'partner' ? 'relation.partner' : 'relation.spouse'
  if (type === 'SIBLING') return subtype === 'half' ? 'relation.halfSibling' : 'relation.sibling'
  return requesterIsParent ? 'relation.parent' : 'relation.child'
}

function actorName(item: InboxItem, t: Translate): string {
  return item.actor ? `${item.actor.firstName} ${item.actor.lastName}`.trim() || t('someone') : t('someone')
}

/** Same wording table as the web inbox, keyed by notification type. */
function describe(item: InboxItem, t: Translate): ReactNode {
  const name = actorName(item, t)
  switch (item.type) {
    case 'TRIBUTE_PENDING':
      return t.rich('describe.tributePending', { profile: item.tribute?.profileName ?? t('aProfile'), strong })
    case 'TRIBUTE_APPROVED':
      return item.viewerActed ? t('describe.tributeApprovedByViewer', { name }) : t('describe.tributeApprovedForAuthor')
    case 'TRIBUTE_REJECTED':
      return item.viewerActed ? t('describe.tributeRejectedByViewer', { name }) : t('describe.tributeDeclinedForAuthor')
    case 'FAMILY_REQUEST_PENDING': {
      const relation = item.familyRelation
      const role = relation ? t(relationKey(relation.type, relation.subtype, relation.requesterIsParent)) : t('relation.relative')
      return t.rich('describe.familyRequestPending', { role, strong })
    }
    case 'FAMILY_REQUEST_ACCEPTED':
      return item.viewerActed ? t('describe.familyAcceptedByViewer', { name }) : t('describe.familyAcceptedByActor')
    case 'FAMILY_REQUEST_REJECTED':
      return item.viewerActed ? t('describe.familyRejectedByViewer', { name }) : t('describe.familyRejectedByActor')
    case 'GUARDIAN_REQUEST_PENDING': {
      const target = item.guardianProfile ? `${item.guardianProfile.firstName} ${item.guardianProfile.lastName}`.trim() : ''
      return t.rich('describe.guardianRequestPending', { target: target || t('thisProfile'), strong })
    }
    case 'GUARDIAN_REQUEST_ACCEPTED':
      return item.viewerActed ? t('describe.guardianAcceptedByViewer', { name }) : t('describe.guardianAcceptedByActor')
    case 'GUARDIAN_REQUEST_REJECTED':
      return item.viewerActed ? t('describe.guardianRejectedByViewer', { name }) : t('describe.guardianRejectedByActor')
    default:
      return null
  }
}

function activityHref(item: InboxItem): string | null {
  if ((item.type === 'TRIBUTE_APPROVED' || item.type === 'TRIBUTE_REJECTED') && item.tribute) return `/profile/${item.tribute.profileId}/tributes`
  if (item.type === 'GUARDIAN_REQUEST_ACCEPTED' && item.guardianProfile) return `/profile/${item.guardianProfile.id}`
  return null
}

interface Decision {
  positive: { label: string; toast: string; call: () => Promise<ActionResponse> }
  negative: { label: string; toast: string; call: () => Promise<ActionResponse> }
}

/** The two actions a pending item offers, or null when its reference is missing. */
function decisionFor(item: InboxItem, t: Translate): Decision | null {
  if (item.type === 'TRIBUTE_PENDING' && item.tributeId && item.tribute) {
    const { tributeId, tribute } = item
    return {
      positive: { label: t('actions.approve'), toast: t('toasts.tributeApproved'), call: () => appApi.approveTribute(tributeId, tribute.profileId) },
      negative: { label: t('actions.reject'), toast: t('toasts.tributeRejected'), call: () => appApi.rejectTribute(tributeId, tribute.profileId) },
    }
  }
  if (item.type === 'FAMILY_REQUEST_PENDING' && item.familyRelationId) {
    const id = item.familyRelationId
    return {
      positive: { label: t('actions.accept'), toast: t('toasts.invitationAccepted'), call: () => appApi.acceptFamilyRequest(id) },
      negative: { label: t('actions.decline'), toast: t('toasts.invitationDeclined'), call: () => appApi.rejectFamilyRequest(id) },
    }
  }
  if (item.type === 'GUARDIAN_REQUEST_PENDING' && item.appUserGuardianId) {
    const id = item.appUserGuardianId
    return {
      positive: { label: t('actions.approve'), toast: t('toasts.coManagementApproved'), call: () => appApi.approveGuardianship(id) },
      negative: { label: t('actions.decline'), toast: t('toasts.coManagementDeclined'), call: () => appApi.rejectGuardianship(id) },
    }
  }
  return null
}

function InboxCard({ item, pending, onDecided }: { item: InboxItem; pending: boolean; onDecided: () => void }) {
  const t = useT('Messages')
  const router = useRouter()
  const { run, pending: busy } = useAction()
  const href = pending ? null : activityHref(item)
  const decision = pending ? decisionFor(item, t) : null
  // Activity the viewer performed reads "You …" but keeps the counterparty's picture.
  const headline = !pending && item.viewerActed ? t('you') : actorName(item, t)
  const image = item.type === 'TRIBUTE_PENDING' ? (item.tribute?.imageUrl ?? null) : null
  const body = item.type === 'TRIBUTE_PENDING' ? (item.tribute?.text ?? null) : null

  const decide = (choice: Decision['positive']) => void run(choice.call, { success: choice.toast, onSuccess: onDecided })

  return (
    <Card onPress={href ? () => router.push(href) : undefined}>
      {image ? <Image source={{ uri: image }} style={{ width: '100%', height: 180, borderRadius: 12 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      <Row className="items-start">
        <Avatar uri={item.actor?.avatarUrl} name={actorName(item, t)} size={40} />
        <View className="flex-1">
          <RNText className="text-sm text-muted">
            <RNText className="font-semibold text-foreground">{headline}</RNText> {describe(item, t)}
          </RNText>
          <Muted className="text-xs">{formatDate(item.createdAt, { utc: true })}</Muted>
        </View>
      </Row>
      {body ? <Text className="text-sm">{body}</Text> : null}
      {decision ? (
        <Row className="justify-end">
          <Button label={decision.negative.label} variant="danger-soft" size="sm" icon="close" disabled={busy} onPress={() => decide(decision.negative)} />
          <Button label={decision.positive.label} size="sm" icon="checkmark" loading={busy} onPress={() => decide(decision.positive)} />
        </Row>
      ) : href ? (
        <Muted className="text-right text-xs">{t('view')}</Muted>
      ) : null}
    </Card>
  )
}

export default function Messages() {
  const t = useT('Messages')
  const notify = useNotify()
  const invalidate = useInvalidate('app')
  const messages = useView('app', ['messages'], appApi.messages)
  const [extra, setExtra] = useState<InboxItem[]>([])
  const [cursor, setCursor] = useState<ActivityCursor | null | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const marking = useRef(false)

  // A fresh first page restarts pagination.
  const firstPage = messages.data
  useEffect(() => {
    setExtra([])
    setCursor(undefined)
  }, [firstPage])

  // The web clears the bell while rendering /messages; here it happens when the inbox is on screen.
  const refetch = messages.refetch
  useFocusEffect(
    useCallback(() => {
      void refetch()
      if (marking.current) return
      marking.current = true
      appApi
        .markMessagesRead()
        .then((result) => {
          if (result.ok && (result.data?.marked ?? 0) > 0) void invalidate(['header'], ['me'])
        })
        .catch(() => undefined)
        .finally(() => {
          marking.current = false
        })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetch]),
  )

  const nextCursor = cursor === undefined ? (firstPage?.nextCursor ?? null) : cursor

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await appApi.loadMoreActivity(nextCursor)
      if (!page || !Array.isArray(page.items)) throw new Error('invalid page')
      setExtra((current) => [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))])
      setCursor(page.nextCursor ?? null)
    } catch (error) {
      notify.error(error)
    } finally {
      setLoadingMore(false)
    }
  }

  const onDecided = () => void invalidate(['messages'], ['header'], ['home'], ['me'])

  return (
    <Screen refreshing={messages.isRefetching} onRefresh={() => void messages.refetch()}>
      <QueryView query={messages}>
        {(data) => {
          const activity = [...data.activity, ...extra.filter((item) => !data.activity.some((known) => known.id === item.id))]
          if (data.pending.length === 0 && activity.length === 0) return <EmptyState icon="flower-outline" title={t('empty')} />
          return (
            <>
              {data.pending.length > 0 ? (
                <Section title={t('pendingAction')} action={<Muted>{t('pendingBadge', { count: data.pending.length })}</Muted>}>
                  {data.pending.map((item) => (
                    <InboxCard key={item.id} item={item} pending onDecided={onDecided} />
                  ))}
                </Section>
              ) : null}
              {activity.length > 0 ? (
                <Section title={t('recentActivity')}>
                  {activity.map((item) => (
                    <InboxCard key={item.id} item={item} pending={false} onDecided={onDecided} />
                  ))}
                  {nextCursor ? <Button label={t('loadMore')} variant="secondary" icon="chevron-down" loading={loadingMore} onPress={() => void loadMore()} /> : null}
                </Section>
              ) : null}
            </>
          )
        }}
      </QueryView>
    </Screen>
  )
}
