// Pure viewport maths for the graph canvas: screen = world * scale + (tx, ty).

export interface Point {
  x: number
  y: number
}

export interface Viewport {
  tx: number
  ty: number
  scale: number
}

export interface Size {
  w: number
  h: number
}

export const MIN_SCALE = 0.1
export const MAX_SCALE = 4
/** Zoom used when jumping to one node, so its label and neighbours are readable. */
export const FOCUS_SCALE = 1.7

export function clampScale(scale: number): number {
  'worklet'
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Label density step for a zoom factor (see `labelVisible` in ./graph). */
export function zoomLevel(scale: number): number {
  'worklet'
  if (scale >= 1.6) return 3
  if (scale >= 1) return 2
  if (scale >= 0.6) return 1
  return 0
}

/** All points visible and centred in `size`, never zoomed in past 1.5×. */
export function fitViewport(points: Iterable<Point>, size: Size, padding = 36): Viewport {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  if (size.w <= 0 || size.h <= 0) return { tx: 0, ty: 0, scale: 1 }
  if (minX === Infinity) return { tx: size.w / 2, ty: size.h / 2, scale: 1 }
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const scale = clampScale(Math.min((size.w - padding * 2) / w, (size.h - padding * 2) / h, 1.5))
  return {
    scale,
    tx: size.w / 2 - ((minX + maxX) / 2) * scale,
    ty: size.h / 2 - ((minY + maxY) / 2) * scale,
  }
}

/** World point in the middle of `size` at `scale`. */
export function focusViewport(point: Point, size: Size, scale: number): Viewport {
  const s = clampScale(scale)
  return { scale: s, tx: size.w / 2 - point.x * s, ty: size.h / 2 - point.y * s }
}

export interface HitTarget extends Point {
  id: string
  r: number
}

/** The closest target whose circle (grown by `slop`) contains the world point, or null. */
export function hitTest(targets: readonly HitTarget[], x: number, y: number, slop: number): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const target of targets) {
    const distance = Math.hypot(target.x - x, target.y - y)
    if (distance <= target.r + slop && distance < bestDistance) {
      best = target.id
      bestDistance = distance
    }
  }
  return best
}
