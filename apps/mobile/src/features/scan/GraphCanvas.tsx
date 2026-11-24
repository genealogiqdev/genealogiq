import { Canvas, Circle, DashPathEffect, Group, matchFont, Path, Skia, Text as SkiaText, type SkFont, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Platform, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated'
import type { ScanConfidence, ScanEdge, ScanNode, ScanNodeType } from '@/api/scan'
import type { Palette } from '@/theme'
import type { TypeColors } from './colors'
import { CONFIDENCES, labelVisible, NODE_TYPES, nodeRadius } from './graph'
import type { Positions } from './layout'
import { clampScale, fitViewport, FOCUS_SCALE, focusViewport, hitTest, zoomLevel, type HitTarget, type Size, type Viewport } from './viewport'

export interface GraphCanvasHandle {
  /** Show every visible node. */
  fit: () => void
  /** Centre one node; with `zoomIn`, also zoom far enough to read its neighbourhood. */
  focus: (id: string, zoomIn?: boolean) => void
}

interface Props {
  /** The visible (filtered) part of the graph. */
  nodes: readonly ScanNode[]
  edges: readonly ScanEdge[]
  /** Positions of the whole graph; nodes without one are not drawn yet. */
  positions: Positions
  settling: boolean
  degree: ReadonlyMap<string, number>
  hubId: string | null
  selectedId: string | null
  colors: TypeColors
  palette: Palette
  /** Height covered by the note panel, so a focused node lands in the part still visible. */
  bottomInset: number
  onSelect: (id: string | null) => void
  accessibilityLabel: string
}

/** Label size in layout units per zoom level, chosen so it stays near 11–16 pt on screen. */
const LABEL_SIZE = [22, 15, 10.5, 7] as const
const LABEL_MAX = 26
const FONT_FAMILY = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' })

function useLabelFonts(): (SkFont | null)[] {
  return useMemo(
    () =>
      LABEL_SIZE.map((fontSize) => {
        try {
          return matchFont({ fontFamily: FONT_FAMILY, fontSize, fontWeight: '500' })
        } catch {
          return null
        }
      }),
    [],
  )
}

interface Drawing {
  edges: SkPath
  activeEdges: SkPath
  fills: { key: string; path: SkPath; color: string; opacity: number }[]
  rings: { key: string; path: SkPath; confidence: ScanConfidence; opacity: number }[]
  targets: HitTarget[]
  selected: HitTarget | null
  /** Selected node and its visible neighbours; null when nothing is selected. */
  highlight: Set<string> | null
}

/**
 * The graph on a Skia canvas. Everything static is baked into a few dozen
 * paths (one for all edges, one per type/confidence bucket of nodes), so a pan
 * or pinch only changes one transform on the UI thread and never re-renders
 * React or rebuilds geometry.
 */
export const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(
  { nodes, edges, positions, settling, degree, hubId, selectedId, colors, palette, bottomInset, onSelect, accessibilityLabel },
  ref,
) {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })
  const [level, setLevel] = useState(1)
  const fonts = useLabelFonts()

  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const scale = useSharedValue(1)
  /** Set once the user pans or zooms: automatic fitting stops fighting them. */
  const touched = useRef(false)
  const markTouched = useCallback(() => {
    touched.current = true
  }, [])

  const drawing = useMemo<Drawing>(() => {
    const visible = new Set<string>()
    const targets: HitTarget[] = []
    for (const node of nodes) {
      const point = positions.get(node.id)
      if (!point) continue
      visible.add(node.id)
      targets.push({ id: node.id, x: point.x, y: point.y, r: nodeRadius(degree.get(node.id) ?? 0, node.id === hubId) })
    }
    const radiusOf = new Map(targets.map((target) => [target.id, target]))

    let highlight: Set<string> | null = null
    if (selectedId && visible.has(selectedId)) {
      highlight = new Set([selectedId])
      for (const edge of edges) {
        if (edge.from === selectedId && visible.has(edge.to)) highlight.add(edge.to)
        else if (edge.to === selectedId && visible.has(edge.from)) highlight.add(edge.from)
      }
    }

    const edgePath = Skia.PathBuilder.Make()
    const activeEdges = Skia.PathBuilder.Make()
    for (const edge of edges) {
      const a = radiusOf.get(edge.from)
      const b = radiusOf.get(edge.to)
      if (!a || !b) continue
      const active = selectedId !== null && (edge.from === selectedId || edge.to === selectedId)
      const path = active ? activeEdges : edgePath
      path.moveTo(a.x, a.y)
      path.lineTo(b.x, b.y)
    }

    const fillPaths = new Map<string, { path: SkPathBuilder; color: string; opacity: number }>()
    const ringPaths = new Map<string, { path: SkPathBuilder; confidence: ScanConfidence; opacity: number }>()
    for (const node of nodes) {
      const target = radiusOf.get(node.id)
      if (!target) continue
      const dim = highlight !== null && !highlight.has(node.id)
      const speculative = node.confidence === 'speculative'
      const fillKey = `${node.type}:${speculative ? 's' : 'n'}:${dim ? 'd' : 'f'}`
      let fill = fillPaths.get(fillKey)
      if (!fill) {
        fill = { path: Skia.PathBuilder.Make(), color: colors[node.type], opacity: (speculative ? 0.45 : 1) * (dim ? 0.2 : 1) }
        fillPaths.set(fillKey, fill)
      }
      fill.path.addCircle(target.x, target.y, target.r)

      const ringKey = `${node.confidence}:${dim ? 'd' : 'f'}`
      let ring = ringPaths.get(ringKey)
      if (!ring) {
        ring = { path: Skia.PathBuilder.Make(), confidence: node.confidence, opacity: (speculative ? 0.6 : 0.9) * (dim ? 0.2 : 1) }
        ringPaths.set(ringKey, ring)
      }
      ring.path.addCircle(target.x, target.y, target.r + 2)
    }

    // Fixed draw order keeps the picture stable from one rebuild to the next.
    const fills: Drawing['fills'] = []
    for (const type of NODE_TYPES as readonly ScanNodeType[]) {
      for (const variant of ['n:d', 's:d', 'n:f', 's:f']) {
        const entry = fillPaths.get(`${type}:${variant}`)
        if (entry) fills.push({ key: `${type}:${variant}`, color: entry.color, opacity: entry.opacity, path: entry.path.detach() })
      }
    }
    const rings: Drawing['rings'] = []
    for (const confidence of CONFIDENCES) {
      for (const variant of ['d', 'f']) {
        const entry = ringPaths.get(`${confidence}:${variant}`)
        if (entry) rings.push({ key: `${confidence}:${variant}`, confidence: entry.confidence, opacity: entry.opacity, path: entry.path.detach() })
      }
    }
    return { edges: edgePath.detach(), activeEdges: activeEdges.detach(), fills, rings, targets, selected: selectedId ? (radiusOf.get(selectedId) ?? null) : null, highlight }
  }, [nodes, edges, positions, degree, hubId, selectedId, colors])

  const labels = useMemo(() => {
    const font = fonts[level]
    if (!font) return []
    const fontSize = LABEL_SIZE[level]
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const result: { id: string; text: string; x: number; y: number; opacity: number; bold: boolean }[] = []
    for (const target of drawing.targets) {
      const node = byId.get(target.id)
      if (!node) continue
      const special = target.id === hubId || target.id === selectedId
      const near = drawing.highlight?.has(target.id) === true && level >= 1
      if (!special && !near && !labelVisible(degree.get(target.id) ?? 0, level)) continue
      const text = node.label.length > LABEL_MAX ? `${node.label.slice(0, LABEL_MAX - 1)}…` : node.label
      const width = font.measureText(text).width
      result.push({
        id: target.id,
        text,
        x: target.x - width / 2,
        y: target.y + target.r + fontSize * 1.15,
        opacity: drawing.highlight && !drawing.highlight.has(target.id) ? 0.25 : 1,
        bold: special,
      })
    }
    return result
  }, [drawing, nodes, degree, hubId, selectedId, level, fonts])

  /* ------------------------------ viewport ------------------------------ */

  const apply = useCallback(
    (viewport: Viewport, animated: boolean) => {
      if (animated) {
        tx.value = withTiming(viewport.tx, { duration: 280 })
        ty.value = withTiming(viewport.ty, { duration: 280 })
        scale.value = withTiming(viewport.scale, { duration: 280 })
      } else {
        tx.value = viewport.tx
        ty.value = viewport.ty
        scale.value = viewport.scale
      }
    },
    [tx, ty, scale],
  )

  const usable = useMemo<Size>(() => ({ w: size.w, h: Math.max(120, size.h - bottomInset) }), [size, bottomInset])
  const targetsRef = useRef(drawing.targets)
  targetsRef.current = drawing.targets
  const usableRef = useRef(usable)
  usableRef.current = usable

  useImperativeHandle(
    ref,
    () => ({
      fit() {
        touched.current = false
        if (usableRef.current.w > 0) apply(fitViewport(targetsRef.current, usableRef.current), true)
      },
      focus(id, zoomIn = true) {
        const target = targetsRef.current.find((candidate) => candidate.id === id)
        if (!target || usableRef.current.w <= 0) return
        touched.current = true
        apply(focusViewport(target, usableRef.current, zoomIn ? Math.max(scale.value, FOCUS_SCALE) : scale.value), true)
      },
    }),
    [apply, scale],
  )

  // Until the user takes over, keep the whole picture in view while it settles.
  const fitted = useRef(false)
  useEffect(() => {
    if (size.w <= 0 || drawing.targets.length === 0 || touched.current) return
    if (fitted.current && !settling) return
    apply(fitViewport(drawing.targets, usableRef.current), fitted.current)
    fitted.current = true
  }, [drawing.targets, size, settling, apply])

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) => (current.w === width && current.h === height ? current : { w: width, h: height }))
  }, [])

  /* ------------------------------ gestures ------------------------------ */

  // Kept in a ref so the gesture object survives parent re-renders (a rebuilt
  // gesture would cut off a pan that is under way while the layout settles).
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const handleTap = useCallback((x: number, y: number, currentScale: number) => {
    // A 22 pt reach on screen whatever the zoom, so small nodes stay tappable.
    onSelectRef.current(hitTest(targetsRef.current, x, y, 22 / currentScale))
  }, [])

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .averageTouches(true)
      .onStart(() => {
        runOnJS(markTouched)()
      })
      .onChange((event) => {
        tx.value += event.changeX
        ty.value += event.changeY
      })
    const pinch = Gesture.Pinch()
      .onStart(() => {
        runOnJS(markTouched)()
      })
      .onChange((event) => {
        const next = clampScale(scale.value * event.scaleChange)
        const k = next / scale.value
        // Zoom about the point between the fingers.
        tx.value = event.focalX - (event.focalX - tx.value) * k
        ty.value = event.focalY - (event.focalY - ty.value) * k
        scale.value = next
      })
    const tap = Gesture.Tap()
      .maxDistance(12)
      .onEnd((event, success) => {
        if (success) runOnJS(handleTap)((event.x - tx.value) / scale.value, (event.y - ty.value) / scale.value, scale.value)
      })
    return Gesture.Race(Gesture.Simultaneous(pan, pinch), tap)
  }, [handleTap, markTouched, tx, ty, scale])

  // Labels change only when the zoom crosses one of three thresholds.
  useAnimatedReaction(
    () => zoomLevel(scale.value),
    (next, previous) => {
      if (next !== previous) runOnJS(setLevel)(next)
    },
  )

  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }])

  const dimmed = drawing.highlight !== null
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }} collapsable={false} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Canvas style={{ flex: 1 }}>
          <Group transform={transform}>
            {/* strokeWidth 0 is a hairline: one device pixel at every zoom. */}
            <Path path={drawing.edges} style="stroke" strokeWidth={0} color={palette.muted} opacity={dimmed ? 0.12 : 0.45} />
            <Path path={drawing.activeEdges} style="stroke" strokeWidth={1.4} color={palette.accent} opacity={0.95} />
            {drawing.fills.map((fill) => (
              <Path key={fill.key} path={fill.path} color={fill.color} opacity={fill.opacity} />
            ))}
            {drawing.rings.map((ring) => (
              <Path key={ring.key} path={ring.path} style="stroke" strokeWidth={ring.confidence === 'documented' ? 1.3 : 1.1} strokeCap="round" color={palette.fg} opacity={ring.opacity}>
                {ring.confidence === 'probable' ? <DashPathEffect intervals={[4, 3]} /> : null}
                {ring.confidence === 'speculative' ? <DashPathEffect intervals={[0.5, 3]} /> : null}
              </Path>
            ))}
            {drawing.selected ? (
              <Circle cx={drawing.selected.x} cy={drawing.selected.y} r={drawing.selected.r + 6} style="stroke" strokeWidth={2} color={palette.accent} />
            ) : null}
            {labels.map((label) => (
              <SkiaText key={label.id} x={label.x} y={label.y} text={label.text} font={fonts[level]} color={palette.fg} opacity={label.bold ? 1 : label.opacity * 0.85} />
            ))}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  )
})
