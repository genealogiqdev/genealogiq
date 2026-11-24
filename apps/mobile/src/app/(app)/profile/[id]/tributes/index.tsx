import { Image } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { appApi, type TributeItem } from '@/api/app'
import { SignUpPrompt } from '@/features/app/SignUpPrompt'
import { useAppUser } from '@/features/app/session'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Avatar, Badge, Button, Card, EmptyState, IconButton, LinkText, Muted, QueryView, Row, Screen, Segmented, Text, confirm, useAction } from '@/ui'
import { usePalette } from '@/theme'

type Sort = 'newest' | 'oldest'

function TributeCard({ tribute, mine, canDelete, profileId, onChanged }: { tribute: TributeItem; mine: boolean; canDelete: boolean; profileId: string; onChanged: () => void }) {
  const t = useT('Tributes')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const palette = usePalette('app')
  const { run, pending } = useAction()
  const author = `${tribute.author.firstName} ${tribute.author.lastName}`.trim()

  async function remove() {
    const confirmed = await confirm({
      title: mine ? t('card.deleteMineTitle') : t('card.deleteOtherTitle'),
      message: t('card.deleteDescription'),
      confirmLabel: t('form.deleteTribute'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!confirmed) return
    await run(() => appApi.deleteTribute(tribute.id), { success: t('toasts.deleted'), onSuccess: onChanged })
  }

  return (
    <Card>
      {tribute.imageUrl ? (
        <Image source={{ uri: tribute.imageUrl }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="cover" accessibilityLabel={t('card.imageAlt', { author })} />
      ) : null}
      <Row className="items-start">
        <Avatar uri={tribute.author.avatarUrl} name={author} size={40} />
        <View className="flex-1">
          <Row className="gap-2">
            <Text className="flex-shrink font-semibold" numberOfLines={1} onPress={() => router.push(`/profile/${tribute.author.id}`)}>
              {author}
            </Text>
            {mine ? <Badge label={t('card.yoursBadge')} color="accent" /> : null}
          </Row>
          <Muted className="text-xs">{formatDate(tribute.createdAt)}</Muted>
        </View>
        {mine ? <IconButton icon="create-outline" label={t('list.editYourTribute')} onPress={() => router.push({ pathname: `/profile/${profileId}/tributes/edit`, params: { tributeId: tribute.id } })} /> : null}
        {canDelete ? <IconButton icon="trash-outline" color={palette.danger} label={t('form.deleteTribute')} onPress={pending ? undefined : () => void remove()} /> : null}
      </Row>
      <Text>{tribute.text}</Text>
    </Card>
  )
}

/** Approved tributes of a profile, the viewer's own pending or declined ones, and the way to add another. */
export default function Tributes() {
  const t = useT('Tributes')
  const tp = useT('Profile')
  const router = useRouter()
  const user = useAppUser()
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const invalidate = useInvalidate('app')
  const tributes = useView('app', ['tributes', id, user?.id ?? null], () => appApi.tributes(id), { enabled: !!id })
  const [sort, setSort] = useState<Sort>('newest')

  const sorted = useMemo(() => {
    const items = [...(tributes.data?.items ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return sort === 'newest' ? items : items.reverse()
  }, [tributes.data, sort])

  const editHref = `/profile/${id}/tributes/edit`
  const changed = () => void invalidate(['tributes', id], ['profile', id], ['messages'])

  return (
    <Screen refreshing={tributes.isRefetching} onRefresh={() => void tributes.refetch()}>
      <Stack.Screen options={{ title: tributes.data ? t('title', { name: tributes.data.profile.firstName }) : tp('tributesTitle') }} />
      <QueryView query={tributes}>
        {(data) => (
          <>
            <Row className="justify-between">
              <Muted className="flex-1 italic">{t('list.subtitle')}</Muted>
              {data.tributeCount > 0 ? <Muted>{t('count', { count: data.tributeCount })}</Muted> : null}
            </Row>

            {data.unpublishedTributes.map((own) => (
              <Card key={own.id}>
                <Row className="items-start">
                  <Badge label={own.status === 'PENDING' ? t('list.awaitingModeration') : t('list.rejected')} color={own.status === 'PENDING' ? 'warning' : 'danger'} />
                </Row>
                <Muted numberOfLines={3}>{own.text}</Muted>
                <LinkText label={t('list.editPendingLink')} onPress={() => router.push({ pathname: editHref, params: { tributeId: own.id } })} />
              </Card>
            ))}

            {data.canWrite ? <Button label={t('list.sendATribute')} icon="send-outline" onPress={() => router.push(editHref)} fullWidth /> : null}

            {sorted.length > 1 ? (
              <Segmented<Sort>
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'newest', label: t('list.newestFirst') },
                  { value: 'oldest', label: t('list.oldestFirst') },
                ]}
              />
            ) : null}

            {sorted.length === 0 ? (
              <EmptyState icon="flower-outline" title={t('list.empty')} />
            ) : (
              <>
                {sorted.map((tribute) => {
                  const mine = !!data.sessionUserId && tribute.author.id === data.sessionUserId
                  return <TributeCard key={tribute.id} tribute={tribute} mine={mine} canDelete={mine || data.isManager} profileId={id} onChanged={changed} />
                })}
                {!data.gated && !data.hasMore ? <Muted className="py-4 text-center text-xs">{t('list.endOfTributes')}</Muted> : null}
              </>
            )}

            {data.gated ? <SignUpPrompt callbackUrl={`/profile/${id}/tributes`} /> : null}
          </>
        )}
      </QueryView>
    </Screen>
  )
}
