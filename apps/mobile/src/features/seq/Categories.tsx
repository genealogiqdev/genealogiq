import { Stack, useRouter } from 'expo-router'
import { seqApi, type CategoryDetail, type CategoryInput } from '@/api/seq'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, Divider, Heading, ListRow, Muted, QueryView, Row, Screen, confirm, useAction } from '@/ui'
import { FormFields, useForm, type Spec } from './forms'
import { ListScreen } from './ListScreen'
import { text } from './util'

export type CategoryKind = 'customers' | 'suppliers'

const CONFIG = {
  customers: {
    namespace: 'CustomerCategories',
    listKey: 'customerCategories',
    itemKey: 'customerCategory',
    list: () => seqApi.customerCategories(),
    one: (id: string) => seqApi.customerCategory(id),
    create: (data: CategoryInput) => seqApi.createCustomerCategory(data),
    update: (id: string, data: CategoryInput) => seqApi.updateCustomerCategory(id, data),
    remove: (id: string) => seqApi.deleteCustomerCategory(id),
    toggle: (id: string) => seqApi.toggleCustomerCategoryActive(id),
    // Categories feed the pickers of these screens.
    related: [['customerNew'], ['customer']],
  },
  suppliers: {
    namespace: 'SupplierCategories',
    listKey: 'supplierCategories',
    itemKey: 'supplierCategory',
    list: () => seqApi.supplierCategories(),
    one: (id: string) => seqApi.supplierCategory(id),
    create: (data: CategoryInput) => seqApi.createSupplierCategory(data),
    update: (id: string, data: CategoryInput) => seqApi.updateSupplierCategory(id, data),
    remove: (id: string) => seqApi.deleteSupplierCategory(id),
    toggle: (id: string) => seqApi.toggleSupplierCategoryActive(id),
    related: [['supplierNew'], ['supplier'], ['suppliers']],
  },
} as const

const oneLine = (label: string) => label.replace(/:\s*$/, '')

export function CategoryList({ kind }: { kind: CategoryKind }) {
  const config = CONFIG[kind]
  const t = useT(config.namespace)
  const router = useRouter()
  const query = useView('seq', [config.listKey], config.list)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <ListScreen
        query={query}
        items={(data) => data.categories}
        keyOf={(category) => category.id}
        emptyTitle={t('table.empty')}
        emptyIcon="pricetags-outline"
        header={() => <Button label={t('new')} icon="add" onPress={() => router.push(`/seq/categories/${kind}/new`)} fullWidth />}
        renderItem={(category) => (
          <Card onPress={() => router.push(`/seq/categories/${kind}/${category.id}`)}>
            <Row className="justify-between">
              <Heading className="flex-1">{category.name}</Heading>
              <Badge label={t(category.isActive ? 'status.active' : 'status.inactive')} color={category.isActive ? 'success' : 'danger'} />
            </Row>
            {category.description ? <Muted>{category.description}</Muted> : null}
            <Muted>{`${t('table.createdAt')}: ${formatDate(category.createdAt)}`}</Muted>
          </Card>
        )}
      />
    </>
  )
}

function CategoryForm({ kind, category }: { kind: CategoryKind; category?: CategoryDetail }) {
  const config = CONFIG[kind]
  const t = useT(config.namespace)
  const tc = useT('Common')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const actions = useAction()
  const form = useForm({ name: category?.name ?? '', description: category?.description ?? '', isActive: category?.isActive ?? true })
  const specs: Spec[] = [
    { key: 'name', label: oneLine(t('fields.name')), required: true, min: 8, max: 24 },
    { key: 'description', label: oneLine(t('fields.description')), required: true, min: 12, max: 48 },
    { key: 'isActive', label: oneLine(t('fields.isActive')), kind: 'switch' },
  ]
  const changed = () => invalidate([config.listKey], [config.itemKey], ...config.related.map((key) => [...key]))

  async function save() {
    if (!form.validate(specs)) return
    const input: CategoryInput = { name: text(form.values, 'name'), description: text(form.values, 'description'), isActive: form.values.isActive === true }
    await form.submit<unknown>(() => (category ? config.update(category.id, input) : config.create(input)), {
      success: true,
      onSuccess: async () => {
        await changed()
        router.back()
      },
    })
  }

  async function remove(target: CategoryDetail) {
    const accepted = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name: target.name })}\n\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await actions.run(() => config.remove(target.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await changed()
        router.back()
      },
    })
  }

  const busy = form.pending || actions.pending
  return (
    <Screen
      footer={<Button label={form.pending ? tc(category ? 'saving' : 'creating') : category ? tc('save') : tc('create')} onPress={() => void save()} loading={form.pending} disabled={actions.pending} fullWidth />}
    >
      <FormFields specs={specs} form={form} disabled={actions.pending} />
      {category ? (
        <Card>
          <ListRow
            title={t(category.isActive ? 'actions.deactivate' : 'actions.reactivate')}
            icon={category.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            chevron={false}
            onPress={
              busy
                ? undefined
                : () =>
                    void actions.run(() => config.toggle(category.id), {
                      success: t(category.isActive ? 'toasts.deactivated' : 'toasts.reactivated'),
                      onSuccess: async () => {
                        await changed()
                      },
                    })
            }
          />
          <Divider />
          <ListRow title={t('actions.delete')} icon="trash-outline" destructive chevron={false} onPress={busy ? undefined : () => void remove(category)} />
        </Card>
      ) : null}
    </Screen>
  )
}

export function CategoryCreate({ kind }: { kind: CategoryKind }) {
  const t = useT(CONFIG[kind].namespace)
  // Supplier categories are module-gated: the gate view answers 403 when the module is off.
  const gate = useView('seq', ['supplierCategoryNew'], () => seqApi.supplierCategoryNew(), { enabled: kind === 'suppliers' })
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      {kind === 'suppliers' ? <QueryView query={gate}>{() => <CategoryForm kind={kind} />}</QueryView> : <CategoryForm kind={kind} />}
    </>
  )
}

export function CategoryEdit({ kind, id }: { kind: CategoryKind; id: string }) {
  const config = CONFIG[kind]
  const t = useT(config.namespace)
  const query = useView('seq', [config.itemKey, id], () => config.one(id))
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>{({ category }) => <CategoryForm key={`${category.id}:${category.isActive}`} kind={kind} category={category} />}</QueryView>
    </>
  )
}
