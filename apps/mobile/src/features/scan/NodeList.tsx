import { useMemo } from 'react'
import { SectionList, View } from 'react-native'
import type { ScanNode, ScanNodeType } from '@/api/scan'
import { useT } from '@/i18n'
import { EmptyState, Heading, ListRow, Muted } from '@/ui'
import { NODE_TYPES } from './graph'
import { ConfidenceBadge, NodeSwatch, useTypeColors } from './parts'

interface Props {
  /** The visible (filtered) notes. */
  nodes: readonly ScanNode[]
  degree: ReadonlyMap<string, number>
  selectedId: string | null
  bottomInset: number
  onSelect: (id: string) => void
}

/** The same notes as the graph, as a plain list grouped by type: the path for screen readers and for anyone who prefers reading. */
export function NodeList({ nodes, degree, selectedId, bottomInset, onSelect }: Props) {
  const t = useT('Mobile.scan')
  const colors = useTypeColors()
  const sections = useMemo(
    () =>
      NODE_TYPES.map((type: ScanNodeType) => ({
        type,
        data: nodes.filter((node) => node.type === type).sort((a, b) => a.label.localeCompare(b.label)),
      })).filter((section) => section.data.length > 0),
    [nodes],
  )

  return (
    <SectionList
      sections={sections}
      keyExtractor={(node) => node.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 32 }}
      ListEmptyComponent={<EmptyState icon="funnel-outline" title={t('list.filteredEmpty')} />}
      renderSectionHeader={({ section }) => (
        <View className="flex-row items-center gap-2 pb-1 pt-4">
          <NodeSwatch color={colors[section.type]} size={12} />
          <Heading accessibilityRole="header">{t(`types.${section.type}`)}</Heading>
          <Muted>{section.data.length}</Muted>
        </View>
      )}
      renderItem={({ item }) => (
        <View className={item.id === selectedId ? 'rounded-xl bg-default px-2' : 'px-2'}>
          <ListRow
            title={item.label}
            subtitle={[item.years, t('list.links', { count: degree.get(item.id) ?? 0 })].filter(Boolean).join(' · ')}
            right={<ConfidenceBadge confidence={item.confidence} />}
            onPress={() => onSelect(item.id)}
          />
        </View>
      )}
    />
  )
}
