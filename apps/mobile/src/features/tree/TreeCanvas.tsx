import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Platform, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { G, Path } from 'react-native-svg'
import type { TreePerson } from '@/api/app'
import { useT } from '@/i18n'
import { usePalette, type Palette } from '@/theme'
import { NODE_H, NODE_W, type LayoutResult } from './layout'
import { buildEdgeSegments, edgeDash, type EdgeKind } from './layout/edges'
import { PersonNode, ROSE, TOGGLE_R, personName, type NodeLabels } from './PersonNode'
import {
  FOCUS_SCALE,
  INITIAL_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  fitViewport,
  focusViewport,
  padBounds,
  zoomViewport,
  type Bounds,
  type Size,
  type Viewport,
} from './viewport'

/* ------------------------------- Viewport API ------------------------------ */

interface CanvasContextValue {
  tx: SharedValue<number>
  ty: SharedValue<number>
  scale: SharedValue<number>
  size: Size
  bounds: Bounds
  zoomBy: (factor: number) => void
  fitView: () => void
  /** Animate so the world point is centred; keeps the current zoom when `scale` is omitted. */
  focusOn: (x: number, y: number, scale?: number) => void
}

const CanvasContext = createContext<CanvasContextValue | null>(null)

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext)
  if (!value) throw new Error('useCanvas must be used inside <TreeCanvas>')
  return value
}

/* ---------------------------------- Edges ---------------------------------- */

const AnimatedG = Animated.createAnimatedComponent(G)

function edgeStroke(kind: EdgeKind, subtype: string, palette: Palette): { color: string; opacity: number } {
  if (kind === 'parent') return { color: palette.accent, opacity: 0.6 }
  if (kind === 'spouse') return subtype === 'married' ? { color: ROSE, opacity: 0.75 } : { color: palette.muted, opacity: 0.65 }
  return { color: palette.muted, opacity: 0.55 }
}

interface EdgesProps {
  layout: LayoutResult
  highlighted: ReadonlySet<string>
  palette: Palette
}

/** Every edge of one style is merged into a single <Path>, so a tree redraws a handful of native nodes. */
const Edges = memo(function Edges({ layout, highlighted, palette }: EdgesProps) {
  const groups = useMemo(() => {
    const merged = new Map<string, { d: string[]; color: string; opacity: number; width: number; dash?: string }>()
    for (const segment of buildEdgeSegments(layout, highlighted)) {
      const dash = segment.highlighted ? undefined : edgeDash(segment.kind, segment.subtype)
      const stroke = segment.highlighted ? { color: palette.warning, opacity: 1 } : edgeStroke(segment.kind, segment.subtype, palette)
      const key = `${stroke.color}|${stroke.opacity}|${dash ?? ''}|${segment.highlighted ? 1 : 0}`
      const group = merged.get(key) ?? { d: [], ...stroke, width: segment.highlighted ? 3 : 1.5, dash }
      group.d.push(segment.d)
      merged.set(key, group)
    }
    // Highlighted paths last so they draw above the rest.
    return Array.from(merged.entries()).sort((a, b) => a[1].width - b[1].width)
  }, [layout, highlighted, palette])

  return (
    <>
      {groups.map(([key, group]) => (
        <Path
          key={key}
          d={group.d.join(' ')}
          stroke={group.color}
          strokeOpacity={group.opacity}
          strokeWidth={group.width}
          strokeDasharray={group.dash}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </>
  )
})

/* ---------------------------------- Canvas --------------------------------- */

export interface TreeCanvasProps {
  layout: LayoutResult
  persons: Record<string, TreePerson>
  rootId: string
  /** Person to open on (the `focus` route param), else the root. */
  focusId: string | null
  sessionUserId: string | null
  selectedId: string | null
  highlightedRelationIds: ReadonlySet<string>
  onPathIds: ReadonlySet<string>
  picks: readonly [string | null, string | null]
  onNodePress: (personId: string) => void
  onToggleCollapse: (personId: string) => void
  /** Controls drawn above the canvas; they can call `useCanvas()`. */
  children?: ReactNode
}

const TIMING = { duration: 320 }

export function TreeCanvas({
  layout,
  persons,
  rootId,
  focusId,
  sessionUserId,
  selectedId,
  highlightedRelationIds,
  onPathIds,
  picks,
  onNodePress,
  onToggleCollapse,
  children,
}: TreeCanvasProps) {
  const t = useT('FamilyTree')
  const tm = useT('Mobile.tree')
  const palette = usePalette('app')
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const scale = useSharedValue(1)

  const bounds = useMemo(() => padBounds(layout.bounds), [layout.bounds])
  const nodes = layout.nodes

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) => (current.w === width && current.h === height ? current : { w: width, h: height }))
  }, [])

  const current = useCallback((): Viewport => ({ tx: tx.value, ty: ty.value, scale: scale.value }), [tx, ty, scale])

  const apply = useCallback(
    (next: Viewport, animated = true) => {
      cancelAnimation(tx)
      cancelAnimation(ty)
      cancelAnimation(scale)
      tx.value = animated ? withTiming(next.tx, TIMING) : next.tx
      ty.value = animated ? withTiming(next.ty, TIMING) : next.ty
      scale.value = animated ? withTiming(next.scale, TIMING) : next.scale
    },
    [tx, ty, scale],
  )

  const zoomBy = useCallback((factor: number) => apply(zoomViewport(current(), factor, size.w / 2, size.h / 2)), [apply, current, size])
  const fitView = useCallback(() => apply(fitViewport(bounds, size)), [apply, bounds, size])
  const focusOn = useCallback(
    (x: number, y: number, target?: number) => apply(focusViewport(x, y, size, target ?? scale.value)),
    [apply, size, scale],
  )

  // Open centred on the focused person (or the root). Runs once per tree/focus,
  // so a refetch after a mutation keeps the viewport where the user left it.
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return
    const targetId = focusId && persons[focusId] ? focusId : rootId
    const key = `${rootId}|${targetId}`
    if (opened.current === key) return
    const node = nodes.find((n) => n.personId === targetId && !n.isDuplicate)
    if (!node && nodes.length === 0) return
    const first = opened.current === null || !opened.current.startsWith(`${rootId}|`)
    opened.current = key
    if (!node) {
      apply(fitViewport(bounds, size), false)
      return
    }
    const fit = fitViewport(bounds, size)
    // A small tree that fits at a readable zoom is shown whole; otherwise open on the person.
    const next =
      first && fit.scale >= INITIAL_SCALE * 0.75 && !focusId
        ? fit
        : focusViewport(node.x + NODE_W / 2, node.y + NODE_H / 2, size, first ? INITIAL_SCALE : Math.max(scale.value, FOCUS_SCALE * 0.7))
    apply(next, !first)
  }, [apply, bounds, focusId, nodes, persons, rootId, scale, size])

  /* ----- gestures: every transform change stays on the UI thread ----- */

  const hitTest = useCallback(
    (x: number, y: number, vtx: number, vty: number, vscale: number) => {
      const wx = (x - vtx) / vscale
      const wy = (y - vty) / vscale
      // A finger is ~44pt whatever the zoom: widen the toggle target when zoomed out.
      const reach = Math.max(TOGGLE_R + 4, 18 / vscale)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (!n.hasCollapsible) continue
        const cx = n.x + NODE_W / 2
        const cy = n.collapseDirection === 'up' ? n.y : n.y + NODE_H
        if (Math.abs(wx - cx) <= reach && Math.abs(wy - cy) <= Math.min(reach, TOGGLE_R + 6)) {
          onToggleCollapse(n.personId)
          return
        }
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H) {
          onNodePress(n.personId)
          return
        }
      }
    },
    [nodes, onNodePress, onToggleCollapse],
  )

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .averageTouches(true)
      .maxPointers(2)
      .minDistance(4)
      .onStart(() => {
        cancelAnimation(tx)
        cancelAnimation(ty)
        cancelAnimation(scale)
      })
      .onChange((event) => {
        tx.value += event.changeX
        ty.value += event.changeY
      })
      .onEnd((event) => {
        tx.value = withDecay({ velocity: event.velocityX, deceleration: 0.994 })
        ty.value = withDecay({ velocity: event.velocityY, deceleration: 0.994 })
      })

    const pinch = Gesture.Pinch()
      .onStart(() => {
        cancelAnimation(tx)
        cancelAnimation(ty)
        cancelAnimation(scale)
      })
      .onChange((event) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * event.scaleChange))
        const k = next / scale.value
        // Keep the world point under the focal point fixed.
        tx.value = event.focalX - (event.focalX - tx.value) * k
        ty.value = event.focalY - (event.focalY - ty.value) * k
        scale.value = next
      })

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(220)
      .onEnd((event, success) => {
        if (!success) return
        const next = scale.value >= MAX_SCALE * 0.8 ? INITIAL_SCALE : Math.min(MAX_SCALE, scale.value * 1.8)
        const k = next / scale.value
        tx.value = withTiming(event.x - (event.x - tx.value) * k, TIMING)
        ty.value = withTiming(event.y - (event.y - ty.value) * k, TIMING)
        scale.value = withTiming(next, TIMING)
      })

    const tap = Gesture.Tap()
      .maxDuration(350)
      .onEnd((event, success) => {
        if (success) runOnJS(hitTest)(event.x, event.y, tx.value, ty.value, scale.value)
      })

    return Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(doubleTap, tap))
  }, [hitTest, scale, tx, ty])

  // Cards: one GPU-transformed container. Its box covers the padded bounds so
  // no card is ever outside its parent, and the origin is its top-left corner.
  const minX = bounds.minX
  const minY = bounds.minY
  const nodesStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value + minX * scale.value }, { translateY: ty.value + minY * scale.value }, { scale: scale.value }],
  }))

  // Edges: a screen-sized <Svg> whose <G> carries the same transform as a
  // native matrix. (An <Svg> sized to the whole tree would allocate a bitmap
  // of that size on Android.)
  const edgeProps = useAnimatedProps(() =>
    Platform.OS === 'web'
      ? ({ transform: `matrix(${scale.value} 0 0 ${scale.value} ${tx.value} ${ty.value})` } as object)
      : ({ matrix: [scale.value, 0, 0, scale.value, tx.value, ty.value] } as object),
  )

  const labels = useMemo<NodeLabels>(
    () => ({
      you: t('node.you'),
      pending: t('node.pending'),
      memorial: t('node.memorial'),
      pet: t('node.pet'),
      duplicate: t('node.duplicateHint'),
      root: tm('rootMarker'),
      expand: t('node.expand'),
      collapse: t('node.collapse'),
    }),
    [t, tm],
  )

  const cards = useMemo(
    () =>
      nodes.map((n) => {
        const person = persons[n.personId]
        if (!person) return null
        const name = personName(person)
        return (
          <PersonNode
            key={n.id}
            person={person}
            displayName={person.maidenName ? t('nameWithMaiden', { name, maidenName: person.maidenName }) : name}
            left={n.x - minX}
            top={n.y - minY}
            palette={palette}
            labels={labels}
            isRoot={n.personId === rootId}
            isSessionUser={n.personId === sessionUserId}
            isSelected={n.personId === selectedId}
            isDuplicate={n.isDuplicate}
            hasCollapsible={n.hasCollapsible}
            isCollapsed={n.isCollapsed}
            collapseDirection={n.collapseDirection}
            isOnPath={onPathIds.has(n.personId)}
            pickIndex={n.personId === picks[0] ? 1 : n.personId === picks[1] ? 2 : 0}
          />
        )
      }),
    [labels, minX, minY, nodes, onPathIds, palette, persons, picks, rootId, selectedId, sessionUserId, t],
  )

  const context = useMemo<CanvasContextValue>(
    () => ({ tx, ty, scale, size, bounds, zoomBy, fitView, focusOn }),
    [tx, ty, scale, size, bounds, zoomBy, fitView, focusOn],
  )

  return (
    <CanvasContext.Provider value={context}>
      <View className="flex-1 overflow-hidden bg-background" onLayout={onLayout}>
        <GestureDetector gesture={gesture}>
          <Animated.View collapsable={false} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
            {size.w > 0 ? (
              <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
                <AnimatedG animatedProps={edgeProps}>
                  <Edges layout={layout} highlighted={highlightedRelationIds} palette={palette} />
                </AnimatedG>
              </Svg>
            ) : null}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: bounds.maxX - bounds.minX,
                  height: bounds.maxY - bounds.minY,
                  transformOrigin: 'left top',
                },
                nodesStyle,
              ]}
            >
              {cards}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        {children}
      </View>
    </CanvasContext.Provider>
  )
}
