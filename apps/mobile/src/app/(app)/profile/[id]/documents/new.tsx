import { Stack } from 'expo-router'
import { appApi } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { EDIT_QUERY, contentKey, useParam } from '@/features/app-content/common'
import { DocumentForm } from '@/features/app-content/DocumentForm'
import { QuotaReached } from '@/features/app-content/QuotaReached'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { LoadingState, QueryView } from '@/ui'

export default function DocumentNewScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const t = useT('Documents')
  const query = useView('app', contentKey(id, 'documentNew'), () => appApi.documentNew(id), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: t('newTitle') }} />
      <QueryView query={query}>
        {(data) =>
          data.allowed ? (
            <DocumentForm profileId={data.profileId} />
          ) : (
            <QuotaReached
              context="documents"
              limit={data.limit}
              tier={data.tier}
              icon="document-text-outline"
              backLabel={t('backToDocuments')}
              backPath={`/profile/${data.profileId}/documents`}
            />
          )
        }
      </QueryView>
    </>
  )
}
