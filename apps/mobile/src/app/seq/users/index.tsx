import { Stack, useRouter } from 'expo-router'
import { seqApi } from '@/api/seq'
import { ListScreen } from '@/features/seq/ListScreen'
import { useMe } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Heading, Muted, Row } from '@/ui'

export default function SeqUsers() {
  const t = useT('Users')
  const router = useRouter()
  const me = useMe()
  const query = useView('seq', ['users'], () => seqApi.users())
  const isAdmin = me.data?.isAdmin === true
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <ListScreen
        query={query}
        items={(data) => data.users}
        keyOf={(user) => user.id}
        emptyTitle={t('table.empty')}
        emptyIcon="people-outline"
        header={isAdmin ? () => <Button label={t('new')} icon="person-add-outline" onPress={() => router.push('/seq/users/new')} fullWidth /> : undefined}
        renderItem={(user) => (
          <Card onPress={() => router.push(`/seq/users/${user.id}`)}>
            <Row className="justify-between">
              <Heading className="flex-1">{`${user.firstName} ${user.lastName}`.trim()}</Heading>
              <Badge label={t(user.isActive ? 'status.active' : 'status.inactive')} color={user.isActive ? 'success' : 'danger'} />
            </Row>
            <Muted>{user.email}</Muted>
            <Muted>{`${t.has(`roles.${user.role}`) ? t(`roles.${user.role}`) : user.role} · ${formatDate(user.createdAt)}`}</Muted>
          </Card>
        )}
      />
    </>
  )
}
