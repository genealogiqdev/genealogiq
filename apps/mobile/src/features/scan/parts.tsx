// Small shared pieces of the scan screens: colour hooks, the confidence
// swatch, type/confidence chips and the source rows.
import type { ReactNode } from 'react'
import { Pressable, Text as RNText, View } from 'react-native'
import type { ScanConfidence, ScanNodeType, ScanSource } from '@/api/scan'
import { useT } from '@/i18n'
import { openInBrowser } from '@/lib/share'
import { useIsDark, usePalette } from '@/theme'
import { Badge, ListRow, Muted, useNotify } from '@/ui'
import { TYPE_COLORS, type TypeColors } from './colors'
import { safeHttpUrl, urlHost } from './markdown'

export function useTypeColors(): TypeColors {
  return useIsDark() ? TYPE_COLORS.dark : TYPE_COLORS.light
}

const BADGE_COLOR: Record<ScanConfidence, 'success' | 'warning' | 'default'> = {
  documented: 'success',
  probable: 'warning',
  speculative: 'default',
}

export function ConfidenceBadge({ confidence }: { confidence: ScanConfidence }) {
  const t = useT('Mobile.scan')
  return <Badge label={t(`confidence.${confidence}`)} color={BADGE_COLOR[confidence]} />
}

/**
 * A node as it is drawn on the graph: fill colour for the type (or neutral),
 * outline style for the confidence: solid, dashed or dotted.
 */
export function NodeSwatch({ color, confidence, size = 14 }: { color?: string; confidence?: ScanConfidence; size?: number }) {
  const palette = usePalette('app')
  const ring = confidence !== undefined
  return (
    <View
      style={{
        width: size + (ring ? 6 : 0),
        height: size + (ring ? 6 : 0),
        borderRadius: (size + 6) / 2,
        borderWidth: ring ? 1.5 : 0,
        borderColor: palette.fg,
        borderStyle: confidence === 'probable' ? 'dashed' : confidence === 'speculative' ? 'dotted' : 'solid',
        opacity: confidence === 'speculative' ? 0.7 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? palette.sep, opacity: confidence === 'speculative' ? 0.5 : 1 }} />
    </View>
  )
}

/** A legend entry that is also a filter: checked = shown on the graph. */
export function FilterChip({ label, checked, onToggle, swatch }: { label: string; checked: boolean; onToggle: () => void; swatch: ReactNode }) {
  const t = useT('Mobile.scan')
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={t(checked ? 'legend.shown' : 'legend.hidden', { label })}
      className={`min-h-11 flex-row items-center gap-2 rounded-full border px-3 ${checked ? 'border-border bg-surface' : 'border-border bg-background opacity-50'}`}
    >
      {swatch}
      <RNText className={`text-sm text-foreground ${checked ? '' : 'line-through'}`}>{label}</RNText>
    </Pressable>
  )
}

export function TypeTag({ type }: { type: ScanNodeType }) {
  const t = useT('Mobile.scan')
  const colors = useTypeColors()
  return (
    <View className="flex-row items-center gap-1.5">
      <NodeSwatch color={colors[type]} size={10} />
      <Muted>{t(`types.${type}`)}</Muted>
    </View>
  )
}

/** Sources as title + host; only http(s) URLs open, in the in-app browser. */
export function SourceList({ sources }: { sources: readonly ScanSource[] }) {
  const t = useT('Mobile.scan')
  const notify = useNotify()
  return (
    <View>
      {sources.map((source) => {
        const url = safeHttpUrl(source.url)
        return (
          <ListRow
            key={source.id}
            icon={url ? 'open-outline' : 'document-text-outline'}
            title={source.title}
            subtitle={url ? urlHost(url) : t('note.sourceNoLink')}
            chevron={false}
            onPress={url ? () => void openInBrowser(url).catch((error: unknown) => notify.error(error)) : undefined}
          />
        )
      })}
    </View>
  )
}
