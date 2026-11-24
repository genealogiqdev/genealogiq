import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { appApi, appHttp, type SearchMode, type TreeView } from '@/api/app'
import { http } from '@/api/client'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { openInBrowser } from '@/lib/share'
import { usePalette } from '@/theme'
import { Avatar, Button, DateField, Field, LinkText, Muted, Segmented, SelectField, Text, useAction, useNotify, type Option } from '@/ui'
import { IdentityFields, SPOUSE_SUBTYPES, emptyIdentity, identityPayload, type IdentityValues, type SpouseSubtype } from './MemberForms'
import type { RelativeKind } from './PersonSheet'
import { PortraitPicker } from './PortraitPicker'
import { TreeSheet } from './TreeSheet'
import { wikiTreeToGhostPrefill, wikiTreeYear, type WikiTreeProfile, type WikiTreeSearchResult } from './wikitree'

type Tree = Extract<TreeView, { state: 'tree' }>
type Source = 'search' | 'guarded' | 'wikitree' | 'create' | 'createPet'

interface SearchResult {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  gender: string | null
  role: string
  petSpecies: string | null
  petBreed: string | null
}

const KIND_ORDER: RelativeKind[] = ['parent', 'spouse', 'sibling', 'child', 'pet']
const KIND_TO_TYPE = { parent: 'PARENT_OF', child: 'PARENT_OF', spouse: 'SPOUSE', sibling: 'SIBLING' } as const

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ResultRow({ title, subtitle, left, selected, busy, onPress }: { title: string; subtitle?: string; left: ReactNode; selected?: boolean; busy?: boolean; onPress: () => void }) {
  const palette = usePalette('app')
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={`min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-2 ${selected ? 'bg-default' : ''} active:opacity-70`}
    >
      {left}
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-medium">
          {title}
        </Text>
        {subtitle ? (
          <Muted numberOfLines={1} className="text-xs">
            {subtitle}
          </Muted>
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={palette.accent} /> : selected ? <Ionicons name="checkmark-circle" size={20} color={palette.accent} /> : null}
    </Pressable>
  )
}

interface Props {
  tree: Tree
  anchorId: string
  initialKind: RelativeKind
  onClose: () => void
  /** After the relative was added: the caller invalidates the tree query. */
  onAdded: () => void
}

/**
 * Add a relative to `anchorId` from the web's four sources — Genealogiq
 * profiles, memorials under the viewer's care, WikiTree (prefills the new
 * person form) and the viewer's pets — or create a new person / pet.
 * Mounted only while open.
 */
export function AddRelativeSheet({ tree, anchorId, initialKind, onClose, onAdded }: Props) {
  const t = useT('FamilyTree')
  const tc = useT('Common')
  const tm = useT('Mobile.tree')
  const user = useRequireAppSession()
  const notify = useNotify()
  const palette = usePalette('app')
  const { run, pending } = useAction()
  const saved = useRef(false)

  const [kind, setKind] = useState<RelativeKind>(initialKind)
  const [source, setSource] = useState<Source>('search')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [spouseSubtype, setSpouseSubtype] = useState<SpouseSubtype>('married')
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [linkSpouse, setLinkSpouse] = useState(true)
  const [identity, setIdentity] = useState<IdentityValues>(emptyIdentity)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [wikiSource, setWikiSource] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState<string | null>(null)
  const [pet, setPet] = useState({ name: '', species: '', breed: '' })
  const [limit, setLimit] = useState<'tree' | 'pets' | null>(null)

  const isPetKind = kind === 'pet'
  const searching = source === 'search' || source === 'guarded'
  const term = useDebounced(query.trim())
  const mode: SearchMode = isPetKind ? 'pet' : source === 'guarded' ? 'guarded-relative' : 'relative'
  const minChars = isPetKind ? 1 : 3
  const searchEnabled = !!user && searching && (mode === 'guarded-relative' || term.length >= minChars)
  const people = useView('app', ['treeSearch', mode, term], () => http<SearchResult[]>('app', appHttp.search(term, mode)), {
    enabled: searchEnabled,
    staleTime: 15_000,
  })
  const wikiEnabled = !!user && source === 'wikitree' && term.length >= 3
  const wiki = useView('app', ['wikitreeSearch', term], () => http<WikiTreeSearchResult[]>('app', appHttp.wikitreeSearch(term)), {
    enabled: wikiEnabled,
    staleTime: 60_000,
    retry: false,
  })

  if (!user) return null

  // Existing parents of the anchor, to offer "Married to X?" when adding a second parent.
  const anchorParents = tree.relations
    .filter((r) => r.type === 'PARENT_OF' && r.toId === anchorId)
    .map((r) => tree.persons[r.fromId])
    .filter((p): p is NonNullable<typeof p> => !!p)
  const showSpouseLink = kind === 'parent' && anchorParents.length > 0
  const linkSpouseId = showSpouseLink && linkSpouse ? anchorParents[0].id : null
  const needsEnd = spouseSubtype === 'divorced' || spouseSubtype === 'widowed'
  const relationFields = {
    subtype: kind === 'spouse' ? spouseSubtype : null,
    startDate: kind === 'spouse' && startedAt ? startedAt : null,
    endDate: kind === 'spouse' && needsEnd && endedAt ? endedAt : null,
    linkSpouseId,
  }

  const done = (message: string) => ({
    success: message,
    onSuccess: () => {
      saved.current = true
      onAdded()
    },
  })

  const resetSearch = () => {
    setQuery('')
    setSelected(null)
    // The portrait picker of the previous form unmounts and discards its staged upload.
    setAvatarUrl(null)
  }

  const changeKind = (next: RelativeKind) => {
    setKind(next)
    setSource('search')
    resetSearch()
  }

  const changeSource = (next: Source) => {
    if (next === 'createPet' && tree.petAtLimit) return setLimit('pets')
    if (next === 'create') setWikiSource(null)
    setSource(next)
    resetSearch()
  }

  const confirmExisting = () => {
    if (!selected) return
    if (isPetKind) {
      void run(() => appApi.attachPet(tree.rootId, selected.id, anchorId), done(t('toasts.petAdded')))
      return
    }
    const fromId = kind === 'parent' ? selected.id : anchorId
    const toId = kind === 'parent' ? anchorId : selected.id
    void run(() => appApi.addRelation(tree.rootId, { fromId, toId, type: KIND_TO_TYPE[kind], ...relationFields }), done(t('toasts.relativeAdded')))
  }

  const confirmGhost = () => {
    if (isPetKind) return
    if (uploading) return notify.info(t('portrait.waitUploading'))
    if (!identity.firstName.trim() || !identity.lastName.trim()) return notify.error(t('toasts.nameRequired'))
    // A new person always grows the tree; the server enforces the same limit.
    if (tree.memberCount >= tree.memberLimit) return setLimit('tree')
    void run(
      () => appApi.addGhostRelative(tree.rootId, { ...identityPayload(identity), avatarUrl, anchorId, kind, ...relationFields }),
      done(t('toasts.personAdded')),
    )
  }

  const confirmPet = () => {
    if (uploading) return notify.info(t('portrait.waitUploading'))
    if (!pet.name.trim()) return notify.error(t('toasts.petNameRequired'))
    if (tree.petAtLimit) return setLimit('pets')
    void run(
      () =>
        appApi.createPet(
          {
            firstName: pet.name.trim(),
            species: pet.species.trim() || null,
            breed: pet.breed.trim() || null,
            gender: null,
            birthDate: null,
            deathDate: null,
            avatarUrl,
            ownerIds: [anchorId],
          },
          tree.rootId,
        ),
      done(t('toasts.petAdded')),
    )
  }

  const pickWikiTree = async (result: WikiTreeSearchResult) => {
    setWikiLoading(result.id)
    try {
      const prefill = wikiTreeToGhostPrefill(await http<WikiTreeProfile>('app', appHttp.wikitreeProfile(result.id)))
      setIdentity({
        ...emptyIdentity,
        firstName: prefill.firstName,
        lastName: prefill.lastName,
        maidenName: prefill.maidenName ?? '',
        gender: prefill.gender ?? '',
        birthDate: prefill.birthDate ?? '',
        deathDate: prefill.deathDate ?? '',
        birthPlace: prefill.birthPlace ?? '',
        deathPlace: prefill.deathPlace ?? '',
      })
      setWikiSource(prefill.sourceUrl)
      setSource('create')
      setQuery('')
    } catch {
      notify.error(t('addRelative.wikitree.profileFetchFailed'))
    } finally {
      setWikiLoading(null)
    }
  }

  const kindOptions: Option<RelativeKind>[] = KIND_ORDER.map((value) => ({ value, label: t(`kinds.${value}`) }))
  const sourceOptions: Option<Source>[] = isPetKind
    ? [
        { value: 'search', label: tm('sourceMyPets') },
        { value: 'createPet', label: t('addRelative.addNewPet') },
      ]
    : [
        { value: 'search', label: tm('sourceGenealogiq') },
        { value: 'guarded', label: t('addRelative.guardedProfiles') },
        { value: 'wikitree', label: tm('sourceWikiTree') },
        { value: 'create', label: tm('sourceNewPerson') },
      ]

  const busy = pending || uploading
  const footer = searching ? (
    <Button label={tc('add')} onPress={confirmExisting} disabled={!selected || busy} loading={pending} fullWidth />
  ) : source === 'create' ? (
    <Button label={pending ? tc('saving') : t('addRelative.addToTree')} onPress={confirmGhost} disabled={busy} loading={pending} fullWidth />
  ) : source === 'createPet' ? (
    <Button label={pending ? tc('saving') : t('addRelative.addPetToTree')} onPress={confirmPet} disabled={busy} loading={pending} fullWidth />
  ) : undefined

  const results = searchEnabled ? (people.data ?? []) : []
  const typedEnough = mode === 'guarded-relative' || query.trim().length >= minChars

  return (
    <>
      {/* Hidden (not unmounted) under the limit sheet so the typed form survives a dismiss. */}
      <TreeSheet
        visible={!limit}
        onClose={busy ? () => undefined : onClose}
        title={source === 'create' ? t('addRelative.newPersonTitle') : source === 'createPet' ? t('addRelative.newPetTitle') : t('addRelative.title')}
        footer={footer}
      >
        <SelectField label={tm('memberType')} value={kind} options={kindOptions} onChange={changeKind} />
        <Segmented value={source} onChange={changeSource} options={sourceOptions} />

        {kind === 'spouse' && source !== 'wikitree' ? (
          <>
            <SelectField
              label={tm('relationType')}
              value={spouseSubtype}
              options={SPOUSE_SUBTYPES.map((value) => ({ value, label: t(`subtypes.${value}`) }))}
              onChange={setSpouseSubtype}
            />
            <DateField
              label={spouseSubtype === 'partner' ? t('addRelative.togetherSince') : t('addRelative.married')}
              value={startedAt}
              onChange={setStartedAt}
              maximumDate={new Date()}
            />
            {needsEnd ? (
              <DateField
                label={spouseSubtype === 'widowed' ? t('addRelative.widowed') : t('addRelative.divorced')}
                value={endedAt}
                onChange={setEndedAt}
                maximumDate={new Date()}
              />
            ) : null}
          </>
        ) : null}

        {showSpouseLink && source !== 'wikitree' ? (
          <Pressable
            onPress={() => setLinkSpouse((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: linkSpouse }}
            className="min-h-11 flex-row items-center gap-3"
          >
            <View className={`h-6 w-6 items-center justify-center rounded-md border ${linkSpouse ? 'border-accent bg-accent' : 'border-field-border bg-field'}`}>
              {linkSpouse ? <Ionicons name="checkmark" size={16} color={palette.afg} /> : null}
            </View>
            <Text className="flex-1">
              {t.rich('addRelative.marriedTo', {
                name: `${anchorParents[0].firstName} ${anchorParents[0].lastName}`.trim(),
                strong: (chunks: ReactNode) => <Text className="font-semibold">{chunks}</Text>,
              })}
            </Text>
          </Pressable>
        ) : null}

        {searching ? (
          <>
            <Field
              value={query}
              onChangeText={(value) => {
                setQuery(value)
                setSelected(null)
              }}
              placeholder={isPetKind ? t('addRelative.petSearchPlaceholder') : source === 'guarded' ? t('addRelative.guardedSearchPlaceholder') : t('addRelative.searchPlaceholder')}
              autoCorrect={false}
              returnKeyType="search"
            />
            {!typedEnough ? (
              <Muted className="py-2 text-center">{tm('searchMinChars', { count: minChars })}</Muted>
            ) : people.isError ? (
              <Muted className="py-2 text-center text-danger">{t('addRelative.searchFailed')}</Muted>
            ) : !searchEnabled || people.isFetching ? (
              <ActivityIndicator color={palette.accent} style={{ paddingVertical: 16 }} />
            ) : results.length === 0 ? (
              <Muted className="py-2 text-center">{t(source === 'guarded' ? 'addRelative.noGuardedProfiles' : 'addRelative.noResults')}</Muted>
            ) : (
              results.map((result) => {
                const isPetResult = result.role === 'APP_PET'
                const name = result.lastName ? `${result.firstName} ${result.lastName}` : result.firstName
                return (
                  <ResultRow
                    key={result.id}
                    title={name}
                    subtitle={
                      isPetResult
                        ? [result.petBreed, result.petSpecies].filter(Boolean).join(' · ')
                        : result.role === 'APP_MEMO'
                          ? t('memorialized')
                          : undefined
                    }
                    left={<Avatar uri={result.avatarUrl} name={name} size={36} />}
                    selected={selected?.id === result.id}
                    onPress={() => setSelected(result)}
                  />
                )
              })
            )}
            {isPetKind ? <Muted className="text-xs">{t('addRelative.petQuota', { count: tree.managedPetCount, limit: tree.petLimit })}</Muted> : null}
          </>
        ) : null}

        {source === 'wikitree' ? (
          <>
            <Field value={query} onChangeText={setQuery} placeholder={t('addRelative.wikitree.placeholder')} autoCorrect={false} returnKeyType="search" />
            {query.trim().length < 3 ? (
              <Muted className="py-2 text-center">{tm('searchMinChars', { count: 3 })}</Muted>
            ) : wiki.isError ? (
              <View className="items-center gap-1 py-2">
                <Muted className="text-center">{t('addRelative.wikitree.unavailable')}</Muted>
                <LinkText label={t('addRelative.wikitree.tryManual')} onPress={() => changeSource('create')} />
              </View>
            ) : !wikiEnabled || wiki.isFetching ? (
              <ActivityIndicator color={palette.accent} style={{ paddingVertical: 16 }} />
            ) : (wiki.data ?? []).length === 0 ? (
              <Muted className="py-2 text-center">{t('addRelative.wikitree.noResults')}</Muted>
            ) : (
              (wiki.data ?? []).map((result) => {
                const years = [wikiTreeYear(result.birthDate), wikiTreeYear(result.deathDate)].filter((year) => year !== null).join(' – ')
                return (
                  <ResultRow
                    key={result.id}
                    title={`${result.firstName} ${result.lastNameCurrent || result.lastNameAtBirth}`.trim()}
                    subtitle={[years, result.birthLocation].filter(Boolean).join(' · ')}
                    left={
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-default">
                        <Ionicons name="globe-outline" size={18} color={palette.muted} />
                      </View>
                    }
                    busy={wikiLoading === result.id}
                    onPress={() => void pickWikiTree(result)}
                  />
                )
              })
            )}
          </>
        ) : null}

        {source === 'create' ? (
          <>
            <PortraitPicker
              value={avatarUrl}
              name={`${identity.firstName} ${identity.lastName}`.trim()}
              payload={{ scope: 'create-ghost' }}
              disabled={pending}
              savedRef={saved}
              onChange={setAvatarUrl}
              onUploadingChange={setUploading}
            />
            {wikiSource ? (
              <View className="flex-row flex-wrap items-center gap-2">
                <Muted className="text-xs">{t('addRelative.wikitree.sourceLabel')}</Muted>
                <LinkText label={t('addRelative.wikitree.viewSource')} onPress={() => void openInBrowser(wikiSource)} />
              </View>
            ) : null}
            <IdentityFields values={identity} onChange={(patch) => setIdentity((current) => ({ ...current, ...patch }))} />
            <Muted className="text-xs">{t('addRelative.ghostHint')}</Muted>
          </>
        ) : null}

        {source === 'createPet' ? (
          <>
            <PortraitPicker
              value={avatarUrl}
              name={pet.name}
              payload={{ scope: 'create-pet' }}
              disabled={pending}
              savedRef={saved}
              onChange={setAvatarUrl}
              onUploadingChange={setUploading}
            />
            <Field label={t('addRelative.petFields.name')} required value={pet.name} onChangeText={(name) => setPet((current) => ({ ...current, name }))} maxLength={64} />
            <Field label={t('addRelative.petFields.species')} value={pet.species} onChangeText={(species) => setPet((current) => ({ ...current, species }))} maxLength={40} />
            <Field label={t('addRelative.petFields.breed')} value={pet.breed} onChangeText={(breed) => setPet((current) => ({ ...current, breed }))} maxLength={60} />
            <Muted className="text-xs">{t('addRelative.petHint')}</Muted>
          </>
        ) : null}
      </TreeSheet>

      <LimitReachedSheet
        visible={limit !== null}
        onClose={() => setLimit(null)}
        context={limit ?? 'tree'}
        limit={limit === 'pets' ? tree.petLimit : tree.memberLimit}
        tier={tree.currentTier}
      />
    </>
  )
}
