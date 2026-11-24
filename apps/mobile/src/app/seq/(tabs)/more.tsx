import { useRouter } from 'expo-router'
import { AccountPanel } from '@/features/account/AccountPanel'
import { useMe } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { Card, Divider, ErrorState, ListRow, Muted, Screen, Section } from '@/ui'

export default function SeqMore() {
  const t = useT()
  const router = useRouter()
  const me = useMe()
  const modules = me.data?.modules
  const company = me.data ? me.data.tenant.tradeName || me.data.tenant.name : null

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <AccountPanel system="seq" />
      {company ? <Muted className="text-center">{company}</Muted> : null}
      {me.isError && !me.data ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}

      <Section title={t('Sidebar.groups.system')}>
        <Card>
          <ListRow title={t('Profile.title')} icon="person-circle-outline" onPress={() => router.push('/seq/profile')} />
          <Divider />
          <ListRow title={t('Sidebar.items.companyData')} icon="business-outline" onPress={() => router.push('/seq/company')} />
          <Divider />
          <ListRow title={t('Sidebar.items.employees')} icon="people-outline" onPress={() => router.push('/seq/users')} />
        </Card>
      </Section>

      <Section title={t('Mobile.seq.more.records')}>
        <Card>
          <ListRow title={t('CustomerCategories.title')} icon="pricetags-outline" onPress={() => router.push('/seq/categories/customers')} />
          {modules?.suppliers ? (
            <>
              <Divider />
              <ListRow title={t('Suppliers.title')} icon="cube-outline" onPress={() => router.push('/seq/suppliers')} />
            </>
          ) : null}
          {modules?.supplierCategories ? (
            <>
              <Divider />
              <ListRow title={t('SupplierCategories.title')} icon="albums-outline" onPress={() => router.push('/seq/categories/suppliers')} />
            </>
          ) : null}
        </Card>
      </Section>

      <Section title={t('Mobile.seq.more.support')}>
        <Card>
          <ListRow title={t('Feedback.links.reportBug')} icon="bug-outline" onPress={() => router.push({ pathname: '/seq/feedback', params: { type: 'bug' } })} />
          <Divider />
          <ListRow title={t('Feedback.links.sendFeedback')} icon="chatbubble-ellipses-outline" onPress={() => router.push({ pathname: '/seq/feedback', params: { type: 'feedback' } })} />
        </Card>
      </Section>
    </Screen>
  )
}
