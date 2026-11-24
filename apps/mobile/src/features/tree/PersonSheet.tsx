import { View } from 'react-native'
import { appApi, type TreePerson, type TreeRelation, type TreeView } from '@/api/app'
import { countryName } from '@/features/app/countries'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { formatDate } from '@/lib/format'
import { usePalette } from '@/theme'
import { Avatar, Badge, Button, Divider, Heading, Icon, IconButton, ListRow, Muted, Text, confirm, useAction, type IconName } from '@/ui'
import { genderColor, personName } from './PersonNode'
import { relationFromRoot } from './relation-label'
import { TreeSheet } from './TreeSheet'

export type RelativeKind = 'parent' | 'child' | 'spouse' | 'sibling' | 'pet'
type Tree = Extract<TreeView, { state: 'tree' }>

interface TimelineEvent {
  id: string
  icon: IconName
  label: string
  date: string | null
  year: number | null
  sort: number
}

function useTimeline(person: TreePerson, tree: Tree): TimelineEvent[] {
  const t = useT('FamilyTree')
  const locale = useLocale((state) => state.locale)
  const events: TimelineEvent[] = []
  const place = (name: string | null, country: string | null) => (name ? (country ? `${name}, ${countryName(country, locale)}` : name) : null)
  const sortOf = (date: string | null, year: number | null) => (date ? new Date(date).getTime() : year ? Date.UTC(year, 0, 1) : 0)

  // A redacted person has no exact date but keeps the year: the event stays.
  if (person.birthDate || person.birthPlace || person.birthYear) {
    const where = place(person.birthPlace, person.birthCountry)
    events.push({
      id: 'born',
      icon: 'gift-outline',
      label: where ? t('timeline.bornIn', { place: where }) : t('timeline.born'),
      date: person.birthDate,
      year: person.birthYear,
      sort: sortOf(person.birthDate, person.birthYear),
    })
  }
  for (const r of tree.relations) {
    if (r.type !== 'SPOUSE' || (r.fromId !== person.id && r.toId !== person.id)) continue
    const spouse = tree.persons[r.fromId === person.id ? r.toId : r.fromId]
    if (!spouse) continue
    const name = personName(spouse)
    events.push({ id: `married-${r.id}`, icon: 'heart-outline', label: t('timeline.married', { name }), date: r.startDate, year: null, sort: sortOf(r.startDate, null) })
    if (r.subtype === 'divorced') {
      events.push({ id: `divorced-${r.id}`, icon: 'heart-dislike-outline', label: t('timeline.divorcedFrom', { name }), date: r.endDate, year: null, sort: sortOf(r.endDate, null) })
    }
  }
  if (person.deathDate || person.deathPlace || person.deathYear) {
    const where = place(person.deathPlace, person.deathCountry)
    events.push({
      id: 'died',
      icon: 'flower-outline',
      label: where ? t('timeline.diedIn', { place: where }) : t('timeline.died'),
      date: person.deathDate,
      year: person.deathYear,
      sort: sortOf(person.deathDate, person.deathYear),
    })
  }
  return events.sort((a, b) => a.sort - b.sort)
}

function SectionTitle({ children }: { children: string }) {
  return <Muted className="text-xs font-medium uppercase">{children}</Muted>
}

interface Props {
  person: TreePerson
  tree: Tree
  isFocused: boolean
  onClose: () => void
  onOpenProfile: (personId: string) => void
  onEditPet: (personId: string) => void
  onSetFocus: (personId: string) => void
  onEdit: (person: TreePerson) => void
  onEditRelation: (relation: TreeRelation) => void
  onAddRelative: (anchorId: string, kind: RelativeKind) => void
  /** After a successful mutation: the caller invalidates the tree query. */
  onChanged: () => void
}

/** Details of one tree member and every action the server flags allow on them. Mounted only while open. */
export function PersonSheet({ person, tree, isFocused, onClose, onOpenProfile, onEditPet, onSetFocus, onEdit, onEditRelation, onAddRelative, onChanged }: Props) {
  const t = useT('FamilyTree')
  const tc = useT('Common')
  const tm = useT('Mobile.tree')
  const palette = usePalette('app')
  const { run, pending } = useAction()
  const events = useTimeline(person, tree)

  const { rootId, persons, relations, sessionUserId } = tree
  const canManage = tree.canManage && !tree.readOnly
  const isSelf = person.id === rootId
  const isGhost = person.role === 'APP_GHOST'
  const isMemorial = person.role === 'APP_MEMO'
  const isPet = person.role === 'APP_PET'
  const managesThis = tree.managedIds.includes(person.id)
  const alreadyRequested = tree.requestedIds.includes(person.id)

  // Same rules as the web sheet.
  const canEditMember = !tree.readOnly && managesThis && (isGhost || isMemorial || isPet || isSelf)
  const canRemoveMember = canManage && !isSelf
  const coManageable = (isGhost || isMemorial || isPet) && !managesThis && !!sessionUserId
  const canEditRelation = (r: TreeRelation) => canManage || (r.status === 'PENDING' && !!sessionUserId && r.requestedById === sessionUserId)
  const isIncoming = (r: TreeRelation) =>
    r.status === 'PENDING' && !!sessionUserId && (r.fromId === sessionUserId || r.toId === sessionUserId) && r.requestedById !== sessionUserId

  const personRelations = relations.filter((r) => r.fromId === person.id || r.toId === person.id)
  const owners = isPet
    ? tree.petOwnerships
        .filter((o) => o.petId === person.id)
        .map((o) => persons[o.ownerId])
        .filter((owner): owner is TreePerson => !!owner)
    : []

  const name = personName(person)
  const displayName = person.maidenName ? t('nameWithMaiden', { name, maidenName: person.maidenName }) : name
  const label = isPet ? t('relation.pet') : relationFromRoot(persons, relations, rootId, person.id, t)
  // "Your father" only reads right when the tree's root is the viewer.
  const relationLabel = isSelf ? (sessionUserId === rootId ? t('infoSheet.thisIsYou') : null) : sessionUserId === rootId ? label : null

  const requestCoManage = () =>
    void run(() => appApi.requestGuardianship(person.id), { success: t('toasts.coManageRequestSent'), onSuccess: onChanged })

  const remove = async () => {
    const ok = await confirm({
      title: t('removeDialog.title'),
      message: t(isGhost ? 'removeDialog.ghostDescription' : isPet ? 'removeDialog.petDescription' : 'removeDialog.personDescription', { name: displayName }),
      confirmLabel: tc('remove'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!ok) return
    void run(() => (isPet ? appApi.detachPetFromTree(rootId, person.id) : appApi.removeMember(rootId, person.id)), {
      success: t('toasts.removedFromTree'),
      onSuccess: () => {
        onClose()
        onChanged()
      },
    })
  }

  const addKinds: { kind: RelativeKind; label: string }[] = [
    { kind: 'parent', label: t('infoSheet.addParent') },
    { kind: 'sibling', label: t('infoSheet.addSibling') },
    { kind: 'spouse', label: t('infoSheet.addPartner') },
    { kind: 'child', label: t('infoSheet.addChild') },
    { kind: 'pet', label: t('infoSheet.addPet') },
  ]

  return (
    <TreeSheet visible onClose={onClose}>
      <View className="flex-row items-center gap-3">
        <View style={{ borderWidth: 2, borderColor: genderColor(person.gender, palette), borderRadius: 32, padding: 2 }}>
          <Avatar uri={person.avatarUrl} name={name} size={56} />
        </View>
        <View className="flex-1">
          <Heading className={isGhost ? 'italic' : undefined}>{displayName}</Heading>
          {person.nickname ? <Muted className="italic">“{person.nickname}”</Muted> : null}
          {relationLabel ? <Text className="text-sm text-accent">{relationLabel}</Text> : null}
          <View className="flex-row flex-wrap gap-1 pt-1">
            {isMemorial ? <Badge label={t('node.memorial')} /> : null}
            {isPet ? <Badge label={t('node.pet')} /> : null}
            {person.pending && !isSelf ? <Badge label={t('node.pending')} color="warning" /> : null}
          </View>
        </View>
      </View>

      <View>
        {!isGhost ? <ListRow icon="open-outline" title={t('infoSheet.seeProfile')} onPress={() => onOpenProfile(person.id)} /> : null}
        {!isFocused ? <ListRow icon="locate-outline" title={tm('setAsFocus')} onPress={() => onSetFocus(person.id)} chevron={false} /> : null}
        {canEditMember ? (
          <ListRow
            icon="create-outline"
            title={tc('edit')}
            subtitle={t('infoSheet.editHint')}
            onPress={() => (isPet ? onEditPet(person.id) : onEdit(person))}
          />
        ) : null}
        {coManageable ? (
          alreadyRequested ? (
            <ListRow icon="hourglass-outline" title={t('infoSheet.pending')} subtitle={t('infoSheet.coManageWaiting')} />
          ) : (
            <ListRow
              icon="shield-outline"
              title={t('infoSheet.coManage')}
              subtitle={t('infoSheet.coManageHint')}
              onPress={pending ? undefined : requestCoManage}
              chevron={false}
            />
          )
        ) : null}
      </View>

      {owners.length > 0 ? (
        <View className="gap-1">
          <SectionTitle>{t('infoSheet.owners')}</SectionTitle>
          {owners.map((owner) => (
            <Text key={owner.id}>{personName(owner)}</Text>
          ))}
        </View>
      ) : null}

      {events.length > 0 ? (
        <View className="gap-2">
          <SectionTitle>{t('infoSheet.timeline')}</SectionTitle>
          {events.map((event) => (
            <View key={event.id} className="flex-row items-start gap-3">
              <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-default">
                <Icon name={event.icon} size={14} color={palette.accent} />
              </View>
              <View className="flex-1">
                <Text className="text-sm">{event.label}</Text>
                {event.date ? <Muted className="text-xs">{formatDate(event.date, { utc: true })}</Muted> : event.year ? <Muted className="text-xs">{String(event.year)}</Muted> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {personRelations.length > 0 ? (
        <View className="gap-1">
          <SectionTitle>{t('infoSheet.relationships')}</SectionTitle>
          {personRelations.map((r) => {
            const counterpart = persons[r.fromId === person.id ? r.toId : r.fromId]
            if (!counterpart) return null
            const kind = r.type === 'PARENT_OF' ? (r.fromId === person.id ? 'child' : 'parent') : r.type === 'SPOUSE' ? 'spouse' : 'sibling'
            const incoming = isIncoming(r)
            const editable = canEditRelation(r) || incoming
            return (
              <View key={r.id} className="min-h-11 flex-row items-center gap-2">
                <View className="flex-1">
                  <Text className="text-sm" numberOfLines={2}>
                    <Text className="text-sm text-muted">{t(`kinds.${kind}`)}: </Text>
                    {personName(counterpart)}
                    {r.subtype ? <Text className="text-xs italic text-muted"> ({t(`subtypes.${r.subtype}`)})</Text> : null}
                  </Text>
                </View>
                {r.status === 'PENDING' ? <Badge label={incoming ? tm('requestBadge') : t('node.pending')} color="warning" /> : null}
                {editable ? (
                  <IconButton icon={incoming && !canEditRelation(r) ? 'mail-unread-outline' : 'create-outline'} label={incoming ? tm('reviewRequest') : tc('edit')} onPress={() => onEditRelation(r)} size={18} />
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

      {canManage && !isPet ? (
        <View className="gap-2">
          <SectionTitle>{t('infoSheet.addRelative')}</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {addKinds.map((item) => (
              <Button key={item.kind} label={item.label} variant="secondary" size="sm" onPress={() => onAddRelative(person.id, item.kind)} />
            ))}
          </View>
        </View>
      ) : null}

      {canRemoveMember ? (
        <>
          <Divider />
          <Button
            label={isPet ? tm('detachPet') : tm('removeFromTree')}
            icon="trash-outline"
            variant="danger-soft"
            onPress={() => void remove()}
            loading={pending}
          />
        </>
      ) : null}
    </TreeSheet>
  )
}
