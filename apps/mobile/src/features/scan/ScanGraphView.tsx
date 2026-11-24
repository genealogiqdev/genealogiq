import { Stack } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Keyboard, Platform, Pressable, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ScanConfidence, ScanGraph, ScanNode, ScanNodeType, ScanRelation } from '@/api/scan'
import { useT } from '@/i18n'
import { shareFile } from '@/lib/share'
import { usePalette } from '@/theme'
import { EmptyState, Field, Heading, Icon, IconButton, ListRow, Muted, Sheet, useNotify, type IconName } from '@/ui'
import { AddToTreeSheet } from './AddToTreeSheet'
import { exportFileName, exportMarkdown, type ExportLabels } from './export'
import { buildIndex, CONFIDENCES, filterGraph, localIds, NODE_TYPES, nodeRadius, searchNodes, surnameNodeId, type LinkDirection } from './graph'
import { GraphCanvas, type GraphCanvasHandle } from './GraphCanvas'
import { NodeList } from './NodeList'
import { NotePanel } from './NotePanel'
import { FilterChip, NodeSwatch, TypeTag, useTypeColors } from './parts'
import { SummarySheet } from './SummarySheet'
import { useGraphLayout } from './useGraphLayout'

// The Skia canvas needs CanvasKit on the web, which this app does not load:
// the web build shows the list view of the same data.
const CAN_DRAW = Platform.OS !== 'web'
const MAX_HOPS = 3

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function ToolButton({ icon, label, active, disabled, onPress }: { icon: IconName; label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  const palette = usePalette('app')
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      className={`min-h-11 flex-row items-center gap-2 rounded-full border px-3 ${active ? 'border-accent bg-accent' : 'border-border bg-surface'} ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={18} color={active ? palette.afg : palette.fg} />
      <RNText className={`text-sm font-medium ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{label}</RNText>
    </Pressable>
  )
}

interface Props {
  graph: ScanGraph
  userId: string
  /** Shown above the graph while the scan is still running. */
  banner?: ReactNode
}

/** The explorable result of a scan: graph or list, search, filters, local graph, notes, summary and export. */
export function ScanGraphView({ graph, userId, banner }: Props) {
  const t = useT('Mobile.scan')
  const tc = useT('Mobile.common')
  const palette = usePalette('app')
  const colors = useTypeColors()
  const notify = useNotify()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()

  const [mode, setMode] = useState<'graph' | 'list'>(CAN_DRAW ? 'graph' : 'list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [types, setTypes] = useState<ReadonlySet<ScanNodeType>>(() => new Set(NODE_TYPES))
  const [confidences, setConfidences] = useState<ReadonlySet<ScanConfidence>>(() => new Set(CONFIDENCES))
  const [local, setLocal] = useState(false)
  const [hops, setHops] = useState(1)
  const [query, setQuery] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [toolbarTop, setToolbarTop] = useState(0)
  const [treeNode, setTreeNode] = useState<ScanNode | null>(null)

  const index = useMemo(() => buildIndex(graph), [graph])
  const hubId = useMemo(() => surnameNodeId(graph, index), [graph, index])
  const radius = useCallback((id: string) => nodeRadius(index.degree.get(id) ?? 0, id === hubId), [index, hubId])
  const layout = useGraphLayout(graph.nodes, graph.edges, radius)

  const selected = selectedId ? (index.byId.get(selectedId) ?? null) : null
  // A node can vanish when the agent rewrites the graph mid-scan.
  useEffect(() => {
    if (selectedId && !index.byId.has(selectedId)) setSelectedId(null)
  }, [selectedId, index])

  const localActive = local && selected !== null
  const visible = useMemo(
    () =>
      filterGraph(graph, {
        types,
        confidences,
        only: localActive && selectedId ? localIds(graph, selectedId, hops) : null,
        keep: selectedId,
      }),
    [graph, types, confidences, localActive, selectedId, hops],
  )

  const canvas = useRef<GraphCanvasHandle>(null)
  const pendingFocus = useRef<{ id: string; zoomIn: boolean } | null>(null)
  const select = useCallback((id: string | null, zoomIn = true) => {
    setSelectedId(id)
    pendingFocus.current = id ? { id, zoomIn } : null
    // The local graph belongs to a selection; without one the whole graph is back.
    if (!id) setLocal(false)
  }, [])
  // Runs after the canvas has rendered the (possibly newly un-hidden) node.
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending || mode !== 'graph') return
    pendingFocus.current = null
    if (!localActive) canvas.current?.focus(pending.id, pending.zoomIn)
  }, [selectedId, visible, mode, localActive])

  // Entering, leaving or resizing the local graph changes what there is to see: frame it.
  const firstFrame = useRef(true)
  useEffect(() => {
    if (firstFrame.current) {
      firstFrame.current = false
      return
    }
    canvas.current?.fit()
  }, [localActive, hops, localActive ? selectedId : null])

  const results = useMemo(() => searchNodes(graph.nodes, query), [graph.nodes, query])

  async function share() {
    const labels: ExportLabels = {
      title: t('export.title', { surname: graph.surname }),
      type: t('export.type'),
      years: t('export.years'),
      confidence: t('export.confidence'),
      links: t('note.linked'),
      sources: t('note.sources'),
      types: Object.fromEntries(NODE_TYPES.map((type) => [type, t(`types.${type}`)])) as ExportLabels['types'],
      confidences: Object.fromEntries(CONFIDENCES.map((confidence) => [confidence, t(`confidence.${confidence}`)])) as ExportLabels['confidences'],
      relation: (relation: ScanRelation, direction: LinkDirection) => t(`relations.${relation}.${direction}`),
    }
    try {
      await shareFile(exportFileName(graph.surname), exportMarkdown(graph, labels), { mimeType: 'text/markdown' })
    } catch (error) {
      notify.error(error)
    }
  }

  const panelHeight = Math.round(Math.min(window.height * 0.5, 460))
  const legendHeight = 60 + insets.bottom

  const typeChips = NODE_TYPES.map((type) => (
    <FilterChip key={type} label={t(`types.${type}`)} checked={types.has(type)} onToggle={() => setTypes((current) => toggled(current, type))} swatch={<NodeSwatch color={colors[type]} />} />
  ))
  const confidenceChips = CONFIDENCES.map((confidence) => (
    <FilterChip
      key={confidence}
      label={t('legend.confidence', { confidence: t(`confidence.${confidence}`), style: t(`confidenceStyle.${confidence}`) })}
      checked={confidences.has(confidence)}
      onToggle={() => setConfidences((current) => toggled(current, confidence))}
      swatch={<NodeSwatch confidence={confidence} size={10} />}
    />
  ))
  const filtered = types.size < NODE_TYPES.length || confidences.size < CONFIDENCES.length

  const legend = (
    <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-background" style={{ paddingBottom: insets.bottom }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }} accessibilityLabel={t('legend.title')}>
        {typeChips}
        <View className="mx-1 h-6 w-px bg-border" />
        {confidenceChips}
      </ScrollView>
    </View>
  )

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: graph.surname || t('title'),
          headerRight: () => (
            <View className="flex-row">
              <IconButton icon="reader-outline" label={t('controls.summary')} onPress={() => setSummaryOpen(true)} />
              <IconButton icon="share-outline" label={t('controls.share')} onPress={() => void share()} />
            </View>
          ),
        }}
      />
      {banner}

      <View className="gap-2 px-3 pt-2" onLayout={(event) => setToolbarTop(event.nativeEvent.layout.y)}>
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder={t('controls.search')}
              accessibilityLabel={t('controls.search')}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              right={query ? <IconButton icon="close-circle" label={tc('close')} size={18} onPress={() => setQuery('')} /> : undefined}
            />
          </View>
          {CAN_DRAW ? (
            <IconButton
              icon={mode === 'graph' ? 'list-outline' : 'git-network-outline'}
              label={t(mode === 'graph' ? 'controls.showList' : 'controls.showGraph')}
              onPress={() => setMode((current) => (current === 'graph' ? 'list' : 'graph'))}
            />
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <ToolButton icon="locate-outline" label={t('controls.local')} active={localActive} disabled={!selected} onPress={() => setLocal((current) => !current)} />
          {localActive ? (
            <View className="flex-row items-center rounded-full border border-border bg-surface">
              <IconButton icon="remove" label={t('controls.fewerHops')} onPress={() => setHops((current) => Math.max(1, current - 1))} />
              <RNText className="min-w-16 text-center text-sm text-foreground" accessibilityLiveRegion="polite">
                {t('controls.hops', { count: hops })}
              </RNText>
              <IconButton icon="add" label={t('controls.moreHops')} onPress={() => setHops((current) => Math.min(MAX_HOPS, current + 1))} />
            </View>
          ) : null}
          <ToolButton icon="funnel-outline" label={t('controls.legend')} active={filtered} onPress={() => setLegendOpen(true)} />
          {mode === 'graph' ? (
            <>
              <ToolButton icon="scan-outline" label={t('controls.fit')} onPress={() => canvas.current?.fit()} />
              <ToolButton
                icon="radio-button-on-outline"
                label={t('controls.recentre')}
                disabled={!hubId}
                onPress={() => {
                  if (!hubId) return
                  setLocal(false)
                  select(hubId)
                }}
              />
            </>
          ) : null}
        </ScrollView>
        {!selected && mode === 'graph' ? <Muted className="pb-1 text-xs">{t('controls.hint')}</Muted> : null}
      </View>

      <View className="flex-1">
        {visible.nodes.length === 0 ? (
          <EmptyState icon="funnel-outline" title={t('list.filteredEmpty')} />
        ) : mode === 'graph' ? (
          <GraphCanvas
            ref={canvas}
            nodes={visible.nodes}
            edges={visible.edges}
            positions={layout.positions}
            settling={layout.settling}
            degree={index.degree}
            hubId={hubId}
            selectedId={selectedId}
            colors={colors}
            palette={palette}
            bottomInset={selected ? panelHeight : legendHeight}
            onSelect={(id) => select(id, false)}
            accessibilityLabel={t('a11y.canvas', { nodes: visible.nodes.length, edges: visible.edges.length })}
          />
        ) : (
          <NodeList nodes={visible.nodes} degree={index.degree} selectedId={selectedId} bottomInset={selected ? panelHeight : legendHeight} onSelect={(id) => select(id)} />
        )}

        {selected ? (
          <NotePanel graph={graph} index={index} node={selected} height={panelHeight} onClose={() => select(null)} onOpen={(id) => select(id)} onAddToTree={setTreeNode} />
        ) : (
          legend
        )}
      </View>

      {/* Last in the tree and inside the screen's bounds, so it is on top and its rows receive touches on Android. */}
      {query.trim() ? (
        <View className="absolute left-3 right-3 rounded-2xl border border-border bg-surface px-3" style={{ top: toolbarTop + 64, elevation: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
          {results.length === 0 ? <Muted className="py-4 text-center">{tc('noResults')}</Muted> : null}
          {results.map((node) => (
            <ListRow
              key={node.id}
              title={node.label}
              subtitle={node.years || undefined}
              right={<TypeTag type={node.type} />}
              chevron={false}
              onPress={() => {
                Keyboard.dismiss()
                setQuery('')
                select(node.id)
              }}
            />
          ))}
        </View>
      ) : null}

      <SummarySheet graph={graph} visible={summaryOpen} onClose={() => setSummaryOpen(false)} />
      <Sheet visible={legendOpen} onClose={() => setLegendOpen(false)} title={t('legend.title')}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
          <Muted>{t('legend.help')}</Muted>
          <Heading className="text-base">{t('legend.types')}</Heading>
          <View className="flex-row flex-wrap gap-2">{typeChips}</View>
          <Heading className="text-base">{t('legend.confidences')}</Heading>
          <View className="flex-row flex-wrap gap-2">{confidenceChips}</View>
          {CONFIDENCES.map((confidence) => (
            <View key={confidence} className="flex-row items-center gap-3">
              <NodeSwatch confidence={confidence} size={10} />
              <Muted className="flex-1">
                {t(`confidence.${confidence}`)}: {t(`confidenceMeaning.${confidence}`)}
              </Muted>
            </View>
          ))}
          <Muted>{t('legend.size')}</Muted>
        </ScrollView>
      </Sheet>
      <AddToTreeSheet node={treeNode} userId={userId} onClose={() => setTreeNode(null)} />
    </View>
  )
}
