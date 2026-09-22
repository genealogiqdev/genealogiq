'use client'

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { SvgCanvas } from "./svg-canvas"
import { ViewportControls } from "./viewport-controls"
import { CanvasSearch } from "./canvas-search"
import { MiniMap } from "./mini-map"
import { CompareTool } from "./compare-tool"
import { PersonNode } from "./person-node"
import { FamilyEdges } from "./edges/family-edges"
import { computeLayout, applyPositionOverrides, NODE_W, NODE_H, type LaidNode } from "./layout"
import { AddRelativeDialog } from "../dialogs/add-relative-dialog"
import { EditMemberDialog } from "../dialogs/edit-member-dialog"
import { PersonInfoSheet } from "../dialogs/person-info-sheet"
import { saveNodePosition } from "@/actions/tree-position.actions"
import { findRelationPath, relationFromRoot } from "@/lib/family-relation-label"
import type { TreePerson, TreePetOwnership, TreeRelation, NodePositionOverride } from "@/queries/family-tree"
import type { PlanTier } from "@/lib/plan-quotas"

type Kind = "parent" | "child" | "spouse" | "sibling" | "pet"

interface Props {
  persons:          Record<string, TreePerson>
  relations:        TreeRelation[]
  petOwnerships:    TreePetOwnership[]
  rootId:           string
  focusId?:         string
  sessionUserId:    string
  canManage:        boolean
  managedIds:       string[]
  requestedIds:     string[]
  initialPositions: Record<string, NodePositionOverride>
  memberCount:      number
  memberLimit:      number
  petCount:         number
  petLimit:         number
  petAtLimit:       boolean
  currentTier:      PlanTier
}

export function FamilyTreeCanvas({
  persons,
  relations,
  petOwnerships,
  rootId,
  focusId,
  sessionUserId,
  canManage,
  managedIds,
  requestedIds,
  initialPositions,
  memberCount,
  memberLimit,
  petCount,
  petLimit,
  petAtLimit,
  currentTier,
}: Props) {
  const router = useRouter()
  const t = useTranslations("FamilyTree")

  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [sheetOpen,     setSheetOpen]     = useState(false)
  const [adder,         setAdder]         = useState<{ anchorId: string; kind: Kind } | null>(null)
  const [editing,       setEditing]       = useState<TreePerson | null>(null)
  const [positions,     setPositions]     = useState(initialPositions)
  // Pure client view state, never persisted — resets on reload (see
  // layout/index.ts's module-level collapse comment).
  const [collapsedIds,  setCollapsedIds]  = useState<Set<string>>(() => new Set())
  const [compareActive, setCompareActive] = useState(false)
  const [comparePicks,  setComparePicks]  = useState<[string | null, string | null]>([null, null])
  const comparablePersons = useMemo(
    () => Object.fromEntries(Object.entries(persons).filter(([, person]) => person.role !== "APP_PET")),
    [persons],
  )

  const layout = useMemo(
    () => computeLayout(persons, relations, rootId, collapsedIds, petOwnerships),
    [persons, relations, rootId, collapsedIds, petOwnerships],
  )

  const activePerson = selectedId ? persons[selectedId] ?? null : null

  const positionedNodes: LaidNode[] = useMemo(
    () => applyPositionOverrides(layout.nodes, positions, layout.generation),
    [layout.nodes, layout.generation, positions],
  )

  const paddedBounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of positionedNodes) {
      if (n.x         < minX) minX = n.x
      if (n.x + NODE_W > maxX) maxX = n.x + NODE_W
      if (n.y         < minY) minY = n.y
      if (n.y + NODE_H > maxY) maxY = n.y + NODE_H
    }
    if (!Number.isFinite(minX)) { minX = 0; maxX = NODE_W; minY = 0; maxY = NODE_H }
    return { minX: minX - 40, maxX: maxX + 40, minY: minY - 40, maxY: maxY + 40 }
  }, [positionedNodes])

  const rootCenter = useMemo(() => {
    const targetId = focusId && persons[focusId] ? focusId : rootId
    const r = positionedNodes.find((n) => n.personId === targetId && !n.isDuplicate)
    if (!r) return null
    return { x: r.x + NODE_W / 2, y: r.y + NODE_H / 2 }
  }, [focusId, persons, positionedNodes, rootId])

  const nodePositions = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    [positionedNodes],
  )

  // Compare tool: shortest path between the two picks, if both are set.
  // `comparePath` (up to 12 hops) is the authoritative "are they connected
  // at all" signal; `compareLabel` (relationFromRoot, capped at 4 hops for
  // vocabulary reasons) is display text only — it may fall back to the
  // generic "relative" for a real but distant connection, which is fine
  // once comparePath has already confirmed connectivity.
  const [comparePick1, comparePick2] = comparePicks
  const comparePath = useMemo(
    () => (comparePick1 && comparePick2 ? findRelationPath(relations, comparePick1, comparePick2) : null),
    [relations, comparePick1, comparePick2],
  )
  const compareLabel = useMemo(
    // possessive=false: "{rootName} is {targetName}'s {label}" already names
    // both people, so the bare noun ("grandmother") is needed — the
    // possessive form ("Your grandmother") would wrongly claim the
    // relationship is to the viewer (see relationFromRoot's own doc
    // comment). Args are pick2-then-pick1 (not pick1-then-pick2) because the
    // sentence's subject is pick1 ("Beatrice is Leonardo's grandmother") —
    // the label must describe pick1 relative to pick2, i.e. pick1 is
    // relationFromRoot's targetId here, pick2 its rootId.
    () => (comparePick1 && comparePick2 ? relationFromRoot(persons, relations, comparePick2, comparePick1, t, false) : null),
    [persons, relations, comparePick1, comparePick2, t],
  )
  const highlightedRelationIds = useMemo(
    () => new Set(comparePath?.steps.map((s) => s.relationId) ?? []),
    [comparePath],
  )
  const onPathPersonIds = useMemo(() => {
    const ids = new Set<string>()
    if (comparePath && comparePick1) {
      ids.add(comparePick1)
      for (const s of comparePath.steps) ids.add(s.toId)
    }
    return ids
  }, [comparePath, comparePick1])

  const handleReposition = useCallback((personId: string, ddx: number, ddy: number) => {
    const gen = layout.generation.get(personId)
    if (gen === undefined) return
    const base = positions[personId]
    const baseDx = base && base.generation === gen ? base.dx : 0
    const baseDy = base && base.generation === gen ? base.dy : 0
    const updated: NodePositionOverride = { dx: baseDx + ddx, dy: baseDy + ddy, generation: gen }
    setPositions((prev) => ({ ...prev, [personId]: updated }))
    // Optimistic: the local state above is already this session's source of
    // truth, so a failure here just means the nudge doesn't survive a reload.
    saveNodePosition(rootId, { personId, ...updated }).then((result) => {
      if (!result.ok) toast.error(result.message)
    })
  }, [layout.generation, positions, rootId])

  const handleComparePick = useCallback((personId: string) => {
    setComparePicks((prev) => {
      if (prev.includes(personId)) return [null, null]
      if (!prev[0]) return [personId, null]
      // Keep the anchor (pick 1) fixed and let further clicks update pick 2,
      // so comparing the same anchor against several people doesn't require
      // re-picking it each time.
      return [prev[0], personId]
    })
  }, [])

  const handleCloseCompare = useCallback(() => {
    setCompareActive(false)
    setComparePicks([null, null])
  }, [])

  const handleClearComparePicks = useCallback(() => setComparePicks([null, null]), [])

  const handleNodeActivate = useCallback((id: string) => {
    if (compareActive) {
      if (persons[id]?.role !== "APP_PET") handleComparePick(id)
      return
    }
    setSelectedId(id)
    setSheetOpen(true)
  }, [compareActive, handleComparePick, persons])

  const handleToggleCollapse = useCallback((personId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }, [])

  const handleAdd = useCallback((anchorId: string, kind: Kind) => {
    if (!canManage) return
    setAdder({ anchorId, kind })
    setSheetOpen(false)
  }, [canManage])

  // Existing parents of a given anchor, so the dialog can offer
  // "Married to X" when adding a 2nd parent.
  const anchorParentsFor = useCallback((anchorId: string) => {
    return relations
      .filter((r) => r.type === "PARENT_OF" && r.toId === anchorId)
      .map((r) => {
        const p = persons[r.fromId]
        return p ? { id: p.id, name: `${p.firstName} ${p.lastName}` } : null
      })
      .filter((p): p is { id: string; name: string } => p !== null)
  }, [relations, persons])

  const handleEdit = useCallback(() => {
    if (activePerson) setEditing(activePerson)
  }, [activePerson])

  const onSuccess = useCallback(() => {
    setAdder(null)
    setEditing(null)
    router.refresh()
  }, [router])

  const edges = (
    <FamilyEdges
      nodes={positionedNodes}
      parentLines={layout.parentLines}
      coupleLines={layout.coupleLines}
      siblingLines={layout.siblingLines}
      petLines={layout.petLines}
      highlightedRelationIds={highlightedRelationIds}
    />
  )

  const nodes = positionedNodes.map((n) => {
    const p = persons[n.personId]
    if (!p) return null
    return (
      <PersonNode
        key={n.id}
        person={p}
        x={n.x}
        y={n.y}
        isRoot={n.personId === rootId}
        isSessionUser={n.personId === sessionUserId}
        isSelected={selectedId === n.personId}
        isDuplicate={n.isDuplicate}
        draggable={canManage && !n.isDuplicate && p.role !== "APP_PET"}
        onReposition={(ddx, ddy) => handleReposition(n.personId, ddx, ddy)}
        hasCollapsible={n.hasCollapsible}
        isCollapsed={n.isCollapsed}
        collapseDirection={n.collapseDirection}
        onToggleCollapse={() => handleToggleCollapse(n.personId)}
        isOnPath={onPathPersonIds.has(n.personId)}
        comparePickIndex={n.personId === comparePick1 ? 1 : n.personId === comparePick2 ? 2 : null}
        onActivate={() => handleNodeActivate(n.personId)}
      />
    )
  })

  return (
    <div className="absolute inset-0">
      <SvgCanvas
        bounds={paddedBounds}
        initialTarget={rootCenter}
        edges={edges}
        nodes={nodes}
        overlays={
          <>
            <ViewportControls rootCenter={rootCenter} />
            {/* Right-aligned column: search, then compare, then the mini-map.
             *  Anchored via `bottom`, not `top`, so the mini-map (last in DOM,
             *  bottom of the column) never moves when a panel above it opens
             *  and grows taller — only the column's top edge shifts up. */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
              <CanvasSearch persons={persons} nodePositions={nodePositions} onPick={handleNodeActivate} />
              <CompareTool
                active={compareActive}
                onActivate={() => setCompareActive(true)}
                onClose={handleCloseCompare}
                persons={comparablePersons}
                picks={comparePicks}
                onClear={handleClearComparePicks}
                connected={!!comparePath}
                label={compareLabel}
              />
              <MiniMap nodes={positionedNodes} bounds={paddedBounds} />
            </div>
          </>
        }
      />

      {adder && (
        <AddRelativeDialog
          open={true}
          onClose={() => setAdder(null)}
          anchorId={adder.anchorId}
          rootId={rootId}
          initialKind={adder.kind}
          anchorParents={anchorParentsFor(adder.anchorId)}
          onSuccess={onSuccess}
          memberCount={memberCount}
          memberLimit={memberLimit}
          petCount={petCount}
          petLimit={petLimit}
          petAtLimit={petAtLimit}
          tier={currentTier}
        />
      )}

      {editing && (
        <EditMemberDialog
          open={true}
          onClose={() => setEditing(null)}
          rootId={rootId}
          person={editing}
          onSuccess={onSuccess}
        />
      )}

      <PersonInfoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        person={activePerson}
        rootId={rootId}
        persons={persons}
        relations={relations}
        petOwnerships={petOwnerships}
        canManage={canManage}
        managedIds={managedIds}
        requestedIds={requestedIds}
        sessionUserId={sessionUserId}
        onEdit={handleEdit}
        onAddRelative={handleAdd}
        onSuccess={onSuccess}
      />
    </div>
  )
}
