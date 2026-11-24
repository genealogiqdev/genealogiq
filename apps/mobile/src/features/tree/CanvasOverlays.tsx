import { memo, useMemo, useState } from 'react'
import { FlatList, Pressable, Text as RNText, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import type { TreePerson } from '@/api/app'
import { useT } from '@/i18n'
import { usePalette } from '@/theme'
import { Field, Icon, IconButton, Muted, Sheet, Text, type IconName } from '@/ui'
import { NODE_H, NODE_W, type LaidNode } from './layout'
import { PICK_ONE, personName } from './PersonNode'
import { useCanvas } from './TreeCanvas'
import { FOCUS_SCALE } from './viewport'

/* ----------------------------- Viewport controls ---------------------------- */

function ControlButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center active:bg-default"
    >
      <Icon name={icon} size={20} />
    </Pressable>
  )
}

export function ViewportControls({ rootCenter }: { rootCenter: { x: number; y: number } | null }) {
  const t = useT('FamilyTree')
  const { zoomBy, fitView, focusOn } = useCanvas()
  return (
    <View className="absolute bottom-4 left-4 overflow-hidden rounded-xl border border-border bg-surface">
      <ControlButton icon="add" label={t('controls.zoomIn')} onPress={() => zoomBy(1.4)} />
      <View className="h-px bg-border" />
      <ControlButton icon="remove" label={t('controls.zoomOut')} onPress={() => zoomBy(1 / 1.4)} />
      <View className="h-px bg-border" />
      <ControlButton icon="scan-outline" label={t('controls.fitTree')} onPress={fitView} />
      {rootCenter ? (
        <>
          <View className="h-px bg-border" />
          <ControlButton icon="locate-outline" label={t('controls.focusRoot')} onPress={() => focusOn(rootCenter.x, rootCenter.y, FOCUS_SCALE)} />
        </>
      ) : null}
    </View>
  )
}

/* --------------------------------- Mini-map -------------------------------- */

const MINI_W = 132
const MINI_H = 88
const PAD = 6

const Dots = memo(function Dots({ nodes, toX, toY, color, faded }: { nodes: LaidNode[]; toX: (x: number) => number; toY: (y: number) => number; color: string; faded: string }) {
  return (
    <Svg width={MINI_W} height={MINI_H}>
      {nodes.map((n) => (
        <Circle
          key={n.id}
          cx={toX(n.x + NODE_W / 2)}
          cy={toY(n.y + NODE_H / 2)}
          r={n.isDuplicate ? 1 : 1.6}
          fill={n.isDuplicate ? faded : color}
          fillOpacity={0.8}
        />
      ))}
    </Svg>
  )
})

/** Overview of the whole tree; the frame follows the viewport on the UI thread. Tap or drag to navigate. */
export function MiniMap({ nodes }: { nodes: LaidNode[] }) {
  const tm = useT('Mobile.tree')
  const palette = usePalette('app')
  const { tx, ty, scale, size, bounds } = useCanvas()

  const boundsW = Math.max(1, bounds.maxX - bounds.minX)
  const boundsH = Math.max(1, bounds.maxY - bounds.minY)
  const mini = Math.min((MINI_W - PAD * 2) / boundsW, (MINI_H - PAD * 2) / boundsH)
  const offX = (MINI_W - boundsW * mini) / 2
  const offY = (MINI_H - boundsH * mini) / 2
  const { minX, minY } = bounds
  const { w, h } = size

  const { toX, toY } = useMemo(
    () => ({ toX: (x: number) => offX + (x - minX) * mini, toY: (y: number) => offY + (y - minY) * mini }),
    [mini, minX, minY, offX, offY],
  )

  const frame = useAnimatedStyle(() => {
    const left = offX + (-tx.value / scale.value - minX) * mini
    const top = offY + (-ty.value / scale.value - minY) * mini
    const right = offX + ((w - tx.value) / scale.value - minX) * mini
    const bottom = offY + ((h - ty.value) / scale.value - minY) * mini
    const l = Math.max(0, Math.min(MINI_W - 2, left))
    const tp = Math.max(0, Math.min(MINI_H - 2, top))
    return {
      left: l,
      top: tp,
      width: Math.max(2, Math.min(MINI_W, right) - l),
      height: Math.max(2, Math.min(MINI_H, bottom) - tp),
    }
  })

  const gesture = useMemo(() => {
    const moveTo = (x: number, y: number) => {
      'worklet'
      cancelAnimation(tx)
      cancelAnimation(ty)
      const wx = minX + (x - offX) / mini
      const wy = minY + (y - offY) / mini
      tx.value = w / 2 - wx * scale.value
      ty.value = h / 2 - wy * scale.value
    }
    return Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => moveTo(event.x, event.y))
      .onChange((event) => moveTo(event.x, event.y))
  }, [h, mini, minX, minY, offX, offY, scale, tx, ty, w])

  if (nodes.length < 2 || w === 0) return null

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        accessible
        accessibilityRole="image"
        accessibilityLabel={tm('miniMap')}
        className="overflow-hidden rounded-lg border border-border bg-surface"
        style={{ width: MINI_W, height: MINI_H }}
      >
        <Dots nodes={nodes} toX={toX} toY={toY} color={palette.accent} faded={palette.muted} />
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', borderWidth: 1.25, borderColor: palette.accent, borderRadius: 2 }, frame]}
        />
      </Animated.View>
    </GestureDetector>
  )
}

/* ---------------------------------- Pills ---------------------------------- */

export function Pill({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const palette = usePalette('app')
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      className={`min-h-11 flex-row items-center gap-2 rounded-full border px-4 ${active ? 'border-accent bg-accent' : 'border-border bg-surface'}`}
    >
      <Icon name={icon} size={16} color={active ? palette.afg : palette.fg} />
      <RNText className={`text-sm font-medium ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{label}</RNText>
    </Pressable>
  )
}

/* ---------------------------------- Search --------------------------------- */

interface SearchProps {
  persons: Record<string, TreePerson>
  nodes: LaidNode[]
  onPick: (personId: string) => void
}

/** Finds a person already in the tree and animates the canvas to them. */
export function TreeSearch({ persons, nodes, onPick }: SearchProps) {
  const t = useT('FamilyTree')
  const { focusOn } = useCanvas()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const placed = useMemo(() => {
    const map = new Map<string, LaidNode>()
    for (const n of nodes) if (!n.isDuplicate) map.set(n.personId, n)
    return map
  }, [nodes])

  const needle = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      needle
        ? Object.values(persons)
            .filter((p) => `${p.firstName} ${p.lastName} ${p.maidenName ?? ''} ${p.nickname ?? ''}`.toLowerCase().includes(needle))
            .slice(0, 20)
        : [],
    [needle, persons],
  )

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (id: string) => {
    close()
    const node = placed.get(id)
    if (node) focusOn(node.x + NODE_W / 2, node.y + NODE_H / 2, FOCUS_SCALE)
    onPick(id)
  }

  return (
    <>
      <Pill icon="search" label={t('canvasSearch.search')} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={close} title={t('canvasSearch.search')}>
        <Field value={query} onChangeText={setQuery} placeholder={t('canvasSearch.placeholder')} autoFocus autoCorrect={false} returnKeyType="search" />
        <FlatList
          data={matches}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 320 }}
          ListEmptyComponent={needle ? <Muted className="py-6 text-center">{t('canvasSearch.noMatches')}</Muted> : undefined}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item.id)}
              accessibilityRole="button"
              className="min-h-11 flex-row items-center justify-between gap-3 border-b border-border py-3 active:opacity-70"
            >
              <Text numberOfLines={1} className={`flex-1 ${item.role === 'APP_GHOST' ? 'italic text-muted' : ''}`}>
                {personName(item)}
                {item.nickname ? ` “${item.nickname}”` : ''}
              </Text>
              {item.birthYear ? <Muted>{String(item.birthYear)}</Muted> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </>
  )
}

/* ------------------------------- Compare panel ------------------------------ */

interface ComparePanelProps {
  persons: Record<string, TreePerson>
  picks: readonly [string | null, string | null]
  connected: boolean
  label: string | null
  onClear: () => void
  onClose: () => void
}

/** Shown at the top while compare mode is on: tap two people to see how they are related. */
export function ComparePanel({ persons, picks, connected, label, onClear, onClose }: ComparePanelProps) {
  const t = useT('FamilyTree')
  const tm = useT('Mobile.tree')
  const tc = useT('Mobile.common')
  const palette = usePalette('app')
  const [first, second] = picks.map((id) => (id ? (persons[id] ?? null) : null))
  return (
    <View className="absolute left-4 right-4 top-4 gap-2 rounded-2xl border border-border bg-surface p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">{t('compare.title')}</Text>
        <IconButton icon="close" label={tc('close')} onPress={onClose} />
      </View>
      {[first, second].map((person, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <View
            className="h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: index === 0 ? PICK_ONE : palette.success }}
          >
            <RNText style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{index + 1}</RNText>
          </View>
          {person ? <Text numberOfLines={1} className="flex-1">{personName(person)}</Text> : <Muted className="flex-1">{tm('comparePick')}</Muted>}
        </View>
      ))}
      {first && second ? (
        <>
          {connected && label ? (
            <Text>{t('compare.resultLine', { targetName: second.firstName, rootName: first.firstName, label })}</Text>
          ) : (
            <Muted>{t('compare.noPath')}</Muted>
          )}
          <Pressable onPress={onClear} accessibilityRole="button" className="min-h-11 flex-row items-center gap-2">
            <Icon name="close-circle-outline" size={18} color={palette.danger} />
            <Muted>{t('compare.clear')}</Muted>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}
