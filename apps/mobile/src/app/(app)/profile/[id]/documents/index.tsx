import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { appApi, appHttp, type DocumentItem } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { HeaderAction, SignUpPrompt, contentKey, useParam } from '@/features/app-content/common'
import { useT } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { useView } from '@/lib/query'
import { openProtectedFile } from '@/lib/share'
import { Badge, Button, Card, EmptyState, Icon, Muted, QueryView, Row, Screen, Sheet, Text, useNotify } from '@/ui'

const pdfName = (document: DocumentItem) => {
  const base = (document.fileName ?? document.title).trim() || 'document'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

/** Documents: title, category, date and visibility; a PDF opens through the protected file route. */
export default function DocumentsScreen() {
  const id = useParam('id')
  const t = useT('Documents')
  const tc = useT('Common')
  const tm = useT('Mobile.appContent')
  const router = useRouter()
  const notify = useNotify()
  const query = useView('app', contentKey(id, 'documents'), () => appApi.documents(id))
  const [active, setActive] = useState<DocumentItem | null>(null)
  const [opening, setOpening] = useState(false)
  const [wall, setWall] = useState(false)
  const [limit, setLimit] = useState(false)

  // Sheets must not stay on top of the screen they navigate to.
  useFocusEffect(
    useCallback(
      () => () => {
        setWall(false)
        setActive(null)
      },
      [],
    ),
  )

  const quota = query.data?.quota ?? null
  const add = () => (quota?.atLimit ? setLimit(true) : router.push(`/profile/${id}/documents/new`))

  async function open(document: DocumentItem) {
    setOpening(true)
    try {
      await openProtectedFile('app', appHttp.documentFile(document.id), pdfName(document), 'application/pdf')
    } catch {
      notify.error(tm('openFailed'))
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: query.data ? t('title', { name: query.data.profile.firstName }) : '',
          headerRight: query.data?.canManage ? () => <HeaderAction icon="add" label={t('addDocument')} onPress={add} /> : undefined,
        }}
      />
      <QueryView query={query}>
        {(data) => (
          <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
            <Muted>{t('tagline')}</Muted>
            {data.items.length > 0 ? (
              <Row className="justify-between">
                <Muted>{t('count', { count: data.count })}</Muted>
                {data.quota ? <Muted>{`${data.count}/${data.quota.documentsMax}`}</Muted> : null}
              </Row>
            ) : null}

            {data.items.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title={t('emptyTitle')}
                action={data.canManage ? <Button label={t('addDocument')} icon="add" onPress={add} /> : undefined}
              />
            ) : (
              data.items.map((document) => (
                <Card key={document.id} onPress={() => (data.gated ? setWall(true) : setActive(document))}>
                  <Row className="items-start">
                    <Icon name="document-text-outline" size={28} />
                    <View className="flex-1 gap-1">
                      <Text numberOfLines={2} className="font-semibold">
                        {document.title}
                      </Text>
                      {document.description ? <Muted numberOfLines={2}>{document.description}</Muted> : null}
                      <View className="flex-row flex-wrap items-center gap-2 pt-1">
                        <Badge label={t(`cat_${document.category}`)} />
                        {data.canManage ? (
                          <Badge label={document.isPublic ? tm('public') : t('privateLabel')} color={document.isPublic ? 'success' : 'warning'} />
                        ) : null}
                      </View>
                      <Muted>{`${t('dateLabel')} ${formatDateTime(document.createdAt)}`}</Muted>
                    </View>
                  </Row>
                </Card>
              ))
            )}

            {data.gated ? <SignUpPrompt /> : null}

            <Sheet visible={active !== null} onClose={() => setActive(null)} title={active?.title}>
              {active ? (
                <View className="gap-3">
                  {active.description ? <Text>{active.description}</Text> : null}
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Badge label={t(`cat_${active.category}`)} />
                    {data.canManage && !active.isPublic ? <Badge label={t('privateLabel')} color="warning" /> : null}
                  </View>
                  <Muted>{`${t('dateLabel')} ${formatDateTime(active.createdAt)}`}</Muted>
                  <Button label={t('viewPdf')} icon="open-outline" onPress={() => void open(active)} loading={opening} fullWidth />
                  {data.canManage ? (
                    <Button
                      label={tc('edit')}
                      icon="create-outline"
                      variant="secondary"
                      onPress={() => {
                        const target = active.id
                        setActive(null)
                        router.push(`/profile/${id}/documents/${target}/edit`)
                      }}
                      fullWidth
                    />
                  ) : null}
                </View>
              ) : null}
            </Sheet>
            <Sheet visible={wall} onClose={() => setWall(false)}>
              <SignUpPrompt />
            </Sheet>
            {data.quota ? (
              <LimitReachedSheet visible={limit} onClose={() => setLimit(false)} context="documents" limit={data.quota.documentsMax} tier={data.quota.tier} />
            ) : null}
          </Screen>
        )}
      </QueryView>
    </>
  )
}
