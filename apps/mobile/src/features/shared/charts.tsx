import { useState } from 'react'
import { Text as RNText, View } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { useCurrentSystem } from '@/i18n'
import { usePalette } from '@/theme'
import { Muted } from '@/ui'

export interface ChartDatum {
  label: string
  value: number
}

/** Categorical series colours (web: the Sequoia --chart-1…5 tokens). */
export const CHART_COLORS = ['#4F72A0', '#6E91C2', '#2E8B57', '#9DB4D2', '#C98A1B', '#7A5230', '#8B5FBF'] as const

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

interface BarChartProps {
  data: readonly ChartDatum[]
  height?: number
  formatValue?: (value: number) => string
  emptyLabel?: string
}

/** Vertical bars with a zero baseline, three gridlines and value labels on top of each bar. */
export function BarChart({ data, height = 200, formatValue = (value) => String(value), emptyLabel }: BarChartProps) {
  const palette = usePalette(useCurrentSystem())
  const [width, setWidth] = useState(0)
  const top = 18
  const bottom = 26
  const plot = height - top - bottom
  const max = niceMax(Math.max(0, ...data.map((item) => item.value)))
  const hasData = data.some((item) => item.value > 0)
  const slot = data.length > 0 ? width / data.length : 0
  const barWidth = Math.min(36, slot * 0.6)
  // Skip labels when they would collide.
  const labelEvery = slot > 0 ? Math.max(1, Math.ceil(44 / slot)) : 1

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image">
      {width > 0 && hasData ? (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((fraction) => {
            const y = top + plot * (1 - fraction)
            return <Line key={fraction} x1={0} x2={width} y1={y} y2={y} stroke={palette.border} strokeWidth={1} />
          })}
          {data.map((item, index) => {
            const barHeight = Math.max(0, (item.value / max) * plot)
            const x = slot * index + (slot - barWidth) / 2
            const y = top + plot - barHeight
            return (
              <G key={`${item.label}-${index}`}>
                <Rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill={palette.accent} />
                {item.value > 0 && slot >= 34 ? (
                  <SvgText x={x + barWidth / 2} y={y - 4} fontSize={10} fill={palette.muted} textAnchor="middle">
                    {formatValue(item.value)}
                  </SvgText>
                ) : null}
                {index % labelEvery === 0 ? (
                  <SvgText x={slot * index + slot / 2} y={height - 8} fontSize={10} fill={palette.muted} textAnchor="middle">
                    {item.label}
                  </SvgText>
                ) : null}
              </G>
            )
          })}
        </Svg>
      ) : width > 0 ? (
        <View className="flex-1 items-center justify-center">
          <Muted>{emptyLabel ?? '—'}</Muted>
        </View>
      ) : null}
    </View>
  )
}

function arc(cx: number, cy: number, radius: number, start: number, end: number): string {
  const point = (angle: number) => `${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`
  const large = end - start > Math.PI ? 1 : 0
  return `M ${point(start)} A ${radius} ${radius} 0 ${large} 1 ${point(end)}`
}

interface DonutChartProps {
  data: readonly ChartDatum[]
  size?: number
  formatValue?: (value: number) => string
  emptyLabel?: string
}

/** Part-to-whole donut with a legend that carries every value as text. */
export function DonutChart({ data, size = 150, formatValue = (value) => String(value), emptyLabel }: DonutChartProps) {
  const palette = usePalette(useCurrentSystem())
  const slices = data.filter((item) => item.value > 0)
  const total = slices.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) {
    return (
      <View className="items-center justify-center" style={{ height: size }}>
        <Muted>{emptyLabel ?? '—'}</Muted>
      </View>
    )
  }
  const stroke = 22
  const radius = (size - stroke) / 2
  const center = size / 2
  let angle = -Math.PI / 2
  return (
    <View className="flex-row items-center gap-4">
      <Svg width={size} height={size} accessibilityRole="image">
        {slices.length === 1 ? (
          <Circle cx={center} cy={center} r={radius} stroke={CHART_COLORS[0]} strokeWidth={stroke} fill="none" />
        ) : (
          slices.map((item, index) => {
            const sweep = (item.value / total) * Math.PI * 2
            // A small gap keeps neighbouring slices distinguishable without relying on colour alone.
            const path = arc(center, center, radius, angle + 0.02, angle + sweep - 0.02)
            angle += sweep
            return <Path key={`${item.label}-${index}`} d={path} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={stroke} fill="none" />
          })
        )}
      </Svg>
      <View className="flex-1 gap-1.5">
        {slices.map((item, index) => (
          <View key={`${item.label}-${index}`} className="flex-row items-center gap-2">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <RNText numberOfLines={1} className="flex-1 text-sm text-foreground">
              {item.label}
            </RNText>
            <RNText className="text-sm text-muted" style={{ color: palette.muted }}>
              {formatValue(item.value)}
            </RNText>
          </View>
        ))}
      </View>
    </View>
  )
}
