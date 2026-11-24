import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { appApi, type TreePerson, type TreeRelation, type TreeView } from '@/api/app'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, ErrorState, IconButton, LoadingState, Muted, Text } from '@/ui'
import { AddRelativeSheet } from './AddRelativeSheet'
import { ComparePanel, MiniMap, Pill, TreeSearch, ViewportControls } from './CanvasOverlays'
import { computeLayout, NODE_H, NODE_W } from './layout'
import { EditMemberSheet, EditRelationSheet } from './MemberForms'
import { PersonSheet, type RelativeKind } from './PersonSheet'
import { findRelationPath, relationFromRoot } from './relation-label'
import { TreeCanvas } from './TreeCanvas'

type Tree = Extract<TreeView, { state: 'tree' }>

const NO_IDS: ReadonlySet<string> = new Set()

interface ScreenProps {
  profileId: string
  focus: string | null
}

/** `/profile/[id]/tree` — the family tree of one profile, read-only for visitors. */
export function TreeScreen({ profileId, focus }: ScreenProps) {
  const router = useRouter()
  const query = useView('app', ['tree', profileId], () => appApi.tree(profileId, focus ?? undefined))
  const data = query.data

  // A pet has no tree of its own: open its owner's tree, focused on the pet.
  useEffect(() => {
    if (data?.state !== 'petRedirect') return
    router.replace({ pathname: '/profile/[id]/tree', params: { id: data.rootId, focus: data.focusId } } as never)
  }, [data, router])

  if (data?.state === 'tree') return <LoadedTree tree={data} focus={focus} />
  if (query.isError && !data) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    )
  }
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <LoadingState />
    </>
  )
}

function LoadedTree({ tree, focus }: { tree: Tree; focus: string | null }) {
  const t = useT('FamilyTree')
  const tm = useT('Mobile.tree')
  const router = useRouter()
  const invalidate = useInvalidate('app')
  const { rootId, persons, relations, petOwnerships, sessionUserId } = tree
  // The server decides: a visitor or a non-manager never sees a mutation control.
  const canManage = tree.canManage && !tree.readOnly

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adder, setAdder] = useState<{ anchorId: string; kind: RelativeKind } | null>(null)
  const [editing, setEditing] = useState<TreePerson | null>(null)
  const [editingRelation, setEditingRelation] = useState<TreeRelation | null>(null)
  // View state only, never persisted (same as the web).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [comparing, setComparing] = useState(false)
  const [picks, setPicks] = useState<readonly [string | null, string | null]>([null, null])

  const layout = useMemo(
    () => computeLayout(persons, relations, rootId, collapsedIds, petOwnerships),
    [persons, relations, rootId, collapsedIds, petOwnerships],
  )

  const focusId = focus && persons[focus] ? focus : null
  const rootCenter = useMemo(() => {
    const node = layout.nodes.find((n) => n.personId === rootId && !n.isDuplicate)
    return node ? { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 } : null
  }, [layout.nodes, rootId])

  /* ----- compare tool: shortest path between two picked people ----- */
  const [pick1, pick2] = picks
  const comparePath = useMemo(() => (pick1 && pick2 ? findRelationPath(relations, pick1, pick2) : null), [relations, pick1, pick2])
  // The sentence names both people ("A is B's grandmother"), so the bare noun describes pick 1 relative to pick 2.
  const compareLabel = useMemo(
    () => (pick1 && pick2 ? relationFromRoot(persons, relations, pick2, pick1, t, false) : null),
    [persons, relations, pick1, pick2, t],
  )
  const highlightedRelationIds = useMemo<ReadonlySet<string>>(
    () => (comparePath ? new Set(comparePath.steps.map((step) => step.relationId)) : NO_IDS),
    [comparePath],
  )
  const onPathIds = useMemo<ReadonlySet<string>>(() => {
    if (!comparing || !pick1) return NO_IDS
    const ids = new Set<string>([pick1])
    if (pick2) ids.add(pick2)
    for (const step of comparePath?.steps ?? []) ids.add(step.toId)
    return ids
  }, [comparePath, comparing, pick1, pick2])

  const onNodePress = useCallback(
    (personId: string) => {
      if (!comparing) {
        setSelectedId(personId)
        return
      }
      if (persons[personId]?.role === 'APP_PET') return
      // Pick 1 stays as the anchor; further taps replace pick 2. Tapping a pick again clears both.
      setPicks((current) => (current.includes(personId) ? [null, null] : current[0] ? [current[0], personId] : [personId, null]))
    },
    [comparing, persons],
  )

  const onToggleCollapse = useCallback((personId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }, [])

  const stopComparing = () => {
    setComparing(false)
    setPicks([null, null])
  }

  /** Every mutation ends here: the tree (and the profile counters) are read back from the server. */
  const refresh = useCallback(() => {
    void invalidate(['tree'], ['profile', rootId])
  }, [invalidate, rootId])

  const selected = selectedId ? (persons[selectedId] ?? null) : null
  const onlyRoot = Object.keys(persons).length <= 1
  const relationFresh = editingRelation ? (relations.find((r) => r.id === editingRelation.id) ?? null) : null

  return (
    <>
      <Stack.Screen
        options={{
          title: t('header.title', { name: tree.rootFirstName }),
          headerRight: canManage
            ? () => <IconButton icon="person-add-outline" label={t('header.addRelative')} onPress={() => setAdder({ anchorId: rootId, kind: 'parent' })} />
            : undefined,
        }}
      />
      <TreeCanvas
        layout={layout}
        persons={persons}
        rootId={rootId}
        focusId={focusId}
        sessionUserId={sessionUserId}
        selectedId={selectedId}
        highlightedRelationIds={highlightedRelationIds}
        onPathIds={onPathIds}
        picks={picks}
        onNodePress={onNodePress}
        onToggleCollapse={onToggleCollapse}
      >
        {comparing ? (
          <ComparePanel
            persons={persons}
            picks={picks}
            connected={!!comparePath}
            label={compareLabel}
            onClear={() => setPicks([null, null])}
            onClose={stopComparing}
          />
        ) : onlyRoot ? (
          <View className="absolute left-4 right-4 top-4 gap-2 rounded-2xl border border-border bg-surface p-4">
            <Text className="font-semibold">{tm('emptyTitle')}</Text>
            <Muted>{canManage ? tm('emptyDescription') : tm('emptyReadOnly')}</Muted>
            {canManage ? (
              <Button label={t('header.addRelative')} icon="person-add-outline" onPress={() => setAdder({ anchorId: rootId, kind: 'parent' })} />
            ) : null}
          </View>
        ) : null}

        <ViewportControls rootCenter={rootCenter} />
        <View className="absolute bottom-4 right-4 items-end gap-2">
          {!onlyRoot ? (
            <>
              <TreeSearch persons={persons} nodes={layout.nodes} onPick={onNodePress} />
              <Pill icon="git-compare-outline" label={t('compare.button')} active={comparing} onPress={() => (comparing ? stopComparing() : setComparing(true))} />
            </>
          ) : null}
          <MiniMap nodes={layout.nodes} />
        </View>
      </TreeCanvas>

      {selected && !adder && !editing && !editingRelation ? (
        <PersonSheet
          person={selected}
          tree={tree}
          isFocused={(focusId ?? rootId) === selected.id}
          onClose={() => setSelectedId(null)}
          onOpenProfile={(id) => {
            setSelectedId(null)
            router.push(`/profile/${id}` as never)
          }}
          onEditPet={(id) => {
            setSelectedId(null)
            router.push(`/profile/${id}/edit` as never)
          }}
          onSetFocus={(id) => {
            setSelectedId(null)
            router.setParams({ focus: id })
          }}
          onEdit={setEditing}
          onEditRelation={setEditingRelation}
          onAddRelative={(anchorId, kind) => setAdder({ anchorId, kind })}
          onChanged={refresh}
        />
      ) : null}

      {adder && canManage ? (
        <AddRelativeSheet
          tree={tree}
          anchorId={adder.anchorId}
          initialKind={adder.kind}
          onClose={() => setAdder(null)}
          onAdded={() => {
            setAdder(null)
            refresh()
          }}
        />
      ) : null}

      {editing ? (
        <EditMemberSheet
          rootId={rootId}
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}

      {relationFresh ? (
        <EditRelationSheet
          rootId={rootId}
          relation={relationFresh}
          persons={persons}
          sessionUserId={sessionUserId}
          canEdit={canManage || (relationFresh.status === 'PENDING' && !!sessionUserId && relationFresh.requestedById === sessionUserId)}
          onClose={() => setEditingRelation(null)}
          onSaved={() => {
            setEditingRelation(null)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}
