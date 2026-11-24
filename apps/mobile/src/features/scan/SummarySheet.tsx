import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import type { ScanGraph } from '@/api/scan'
import { useT } from '@/i18n'
import { Divider, Heading, KeyValue, Muted, Sheet } from '@/ui'
import { CONFIDENCES, countByConfidence, countByType, NODE_TYPES } from './graph'
import { Markdown } from './MarkdownText'
import { NodeSwatch, SourceList, useTypeColors } from './parts'

/** The scan as a whole: the agent's overview, what the graph contains and every source. */
export function SummarySheet({ graph, visible, onClose }: { graph: ScanGraph; visible: boolean; onClose: () => void }) {
  const t = useT('Mobile.scan')
  const colors = useTypeColors()
  const byType = useMemo(() => countByType(graph.nodes), [graph.nodes])
  const byConfidence = useMemo(() => countByConfidence(graph.nodes), [graph.nodes])

  return (
    <Sheet visible={visible} onClose={onClose} title={t('summary.title', { surname: graph.surname })}>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
        <Muted>{t('summary.counts', { nodes: graph.nodes.length, edges: graph.edges.length, sources: graph.sources.length })}</Muted>
        {graph.summary ? <Markdown source={graph.summary} /> : <Muted>{t('summary.noSummary')}</Muted>}

        <Divider />
        <View>
          <Heading className="text-base">{t('summary.byType')}</Heading>
          {NODE_TYPES.map((type) => (
            <View key={type} className="flex-row items-center gap-2">
              <NodeSwatch color={colors[type]} size={10} />
              <View className="flex-1">
                <KeyValue label={t(`types.${type}`)} value={String(byType[type])} />
              </View>
            </View>
          ))}
        </View>

        <View>
          <Heading className="text-base">{t('summary.byConfidence')}</Heading>
          {CONFIDENCES.map((confidence) => (
            <View key={confidence} className="flex-row items-center gap-2">
              <NodeSwatch confidence={confidence} size={10} />
              <View className="flex-1">
                <KeyValue label={t(`confidence.${confidence}`)} value={String(byConfidence[confidence])} />
                <Muted className="text-xs">{t(`confidenceMeaning.${confidence}`)}</Muted>
              </View>
            </View>
          ))}
        </View>

        <Divider />
        <View>
          <Heading className="text-base">{t('summary.sources')}</Heading>
          {graph.sources.length === 0 ? <Muted>{t('note.noSources')}</Muted> : <SourceList sources={graph.sources} />}
        </View>
      </ScrollView>
    </Sheet>
  )
}
