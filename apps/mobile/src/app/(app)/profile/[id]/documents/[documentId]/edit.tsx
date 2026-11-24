import { Stack } from 'expo-router'
import { appApi } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { EDIT_QUERY, contentKey, useParam } from '@/features/app-content/common'
import { DocumentForm } from '@/features/app-content/DocumentForm'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { LoadingState, QueryView } from '@/ui'

export default function DocumentEditScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const documentId = useParam('documentId')
  const t = useT('Documents')
  const query = useView('app', contentKey(id, 'documentEdit', documentId), () => appApi.documentEdit(id, documentId), {
    ...EDIT_QUERY,
    enabled: !!user,
  })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: t('editTitle') }} />
      <QueryView query={query}>{(data) => <DocumentForm profileId={data.profileId} existing={data.document} />}</QueryView>
    </>
  )
}
