import { Stack, useRouter } from 'expo-router'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { HeaderAction, SignUpPrompt, contentKey, useParam } from '@/features/app-content/common'
import { PhotoGrid } from '@/features/app-content/MediaViewer'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, Card, EmptyState, Muted, QueryView, Screen, Text, Title } from '@/ui'

/** Biography: quote, life story and photos. Public; a visitor also gets the sign-up prompt. */
export default function BioScreen() {
  const id = useParam('id')
  const t = useT('Bio')
  const tc = useT('Common')
  const router = useRouter()
  const query = useView('app', contentKey(id, 'bio'), () => appApi.bio(id))
  const edit = () => router.push(`/profile/${id}/bio/edit`)

  return (
    <>
      <Stack.Screen
        options={{
          title: query.data ? t('title', { name: query.data.profile.firstName }) : '',
          headerRight: query.data?.canManage ? () => <HeaderAction icon="create-outline" label={tc('edit')} onPress={edit} /> : undefined,
        }}
      />
      <QueryView query={query}>
        {(data) => {
          const paragraphs = (data.bio?.text ?? '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
          const photos = [...(data.bio?.images ?? [])].sort((a, b) => a.order - b.order).map((image) => image.url)
          return (
            <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
              <Muted>{t('subtitle')}</Muted>
              {data.isEmpty || !data.bio ? (
                <EmptyState
                  icon="book-outline"
                  title={t('empty')}
                  action={data.canManage ? <Button label={t('writeBiography')} icon="create-outline" onPress={edit} /> : undefined}
                />
              ) : (
                <>
                  {data.bio.quote ? (
                    <Card>
                      <Title className="text-xl italic">{`“${data.bio.quote}”`}</Title>
                    </Card>
                  ) : null}
                  <PhotoGrid photos={photos} label={() => t('photoAlt')} />
                  {paragraphs.length > 0 ? (
                    <View className="gap-3">
                      {paragraphs.map((paragraph, index) => (
                        <Text key={index} className="leading-6" selectable>
                          {paragraph}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
              {data.gated ? <SignUpPrompt /> : null}
            </Screen>
          )
        }}
      </QueryView>
    </>
  )
}
