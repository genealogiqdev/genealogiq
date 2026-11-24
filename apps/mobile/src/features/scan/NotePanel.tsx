import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ScanGraph, ScanNode } from '@/api/scan'
import { useT } from '@/i18n'
import { Button, Divider, Heading, IconButton, ListRow, Muted, Text } from '@/ui'
import { linkGroups, nodeSources, type GraphIndex } from './graph'
import { Markdown } from './MarkdownText'
import { ConfidenceBadge, NodeSwatch, SourceList, TypeTag, useTypeColors } from './parts'

interface Props {
  graph: ScanGraph
  index: GraphIndex
  node: ScanNode
  /** Panel height in points (the canvas keeps the focused node above it). */
  height: number
  onClose: () => void
  /** Jump to a linked note. */
  onOpen: (id: string) => void
  onAddToTree: (node: ScanNode) => void
}

/**
 * The note of one node, docked under the graph (not a modal, so the selected
 * node and its highlighted neighbours stay visible above it).
 */
export function NotePanel({ graph, index, node, height, onClose, onOpen, onAddToTree }: Props) {
  const t = useT('Mobile.scan')
  const tc = useT('Mobile.common')
  const insets = useSafeAreaInsets()
  const colors = useTypeColors()
  const groups = useMemo(() => linkGroups(index, node.id), [index, node.id])
  const sources = useMemo(() => nodeSources(graph, node), [graph, node])

  return (
    <View
      className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-surface"
      style={{ height, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}
      accessibilityViewIsModal={false}
    >
      <View className="flex-row items-start gap-2 px-4 pt-3">
        <View className="flex-1 gap-1">
          <Heading accessibilityRole="header">{node.label}</Heading>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <TypeTag type={node.type} />
            {node.years ? <Muted>{node.years}</Muted> : null}
          </View>
        </View>
        <IconButton icon="close" label={tc('close')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View className="flex-row items-center gap-2">
          <ConfidenceBadge confidence={node.confidence} />
          <Muted className="flex-1">{t(`confidenceMeaning.${node.confidence}`)}</Muted>
        </View>

        {node.summary ? <Markdown source={node.summary} /> : <Muted>{t('note.noSummary')}</Muted>}

        {node.type === 'person' ? <Button label={t('tree.action')} icon="git-network-outline" variant="secondary" onPress={() => onAddToTree(node)} /> : null}

        <Divider />
        <View className="gap-1">
          <Heading className="text-base">{t('note.linked')}</Heading>
          {groups.length === 0 ? <Muted>{t('note.noLinks')}</Muted> : null}
          {groups.map((group) => (
            <View key={`${group.relation}:${group.direction}`} className="pt-1">
              <Muted className="uppercase tracking-wide text-xs">{t(`relations.${group.relation}.${group.direction}`)}</Muted>
              {group.items.map((link, position) => (
                <ListRow
                  key={`${link.node.id}:${position}`}
                  left={<NodeSwatch color={colors[link.node.type]} confidence={link.node.confidence} size={10} />}
                  title={link.node.label}
                  subtitle={[t(`types.${link.node.type}`), link.node.years, link.label].filter(Boolean).join(' · ')}
                  onPress={() => onOpen(link.node.id)}
                />
              ))}
            </View>
          ))}
        </View>

        <Divider />
        <View className="gap-1">
          <Heading className="text-base">{t('note.sources')}</Heading>
          {sources.length === 0 ? <Text className="text-sm text-muted">{t('note.noSources')}</Text> : <SourceList sources={sources} />}
        </View>
      </ScrollView>
    </View>
  )
}
