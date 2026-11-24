// Pure viewport maths shared by the canvas, the controls and the mini-map.
// A viewport maps world (layout) coordinates to screen: screen = world * scale + (tx, ty).

export interface Viewport {
  tx: number
  ty: number
  scale: number
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Size {
  w: number
  h: number
}

/** Lower than the web's 0.25 so a 150-person tree still fits a phone screen. */
export const MIN_SCALE = 0.08
export const MAX_SCALE = 2.5
/** The web opens at 1.2; a phone shows barely two cards at that zoom. */
export const INITIAL_SCALE = 0.9
export const FOCUS_SCALE = 1.1
export const BOUNDS_PADDING = 40

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export function padBounds(bounds: Bounds, padding = BOUNDS_PADDING): Bounds {
  return { minX: bounds.minX - padding, maxX: bounds.maxX + padding, minY: bounds.minY - padding, maxY: bounds.maxY + padding }
}

/** Whole tree visible, centred. */
export function fitViewport(bounds: Bounds, size: Size, padding = 0.06): Viewport {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  if (size.w <= 0 || size.h <= 0) return { tx: 0, ty: 0, scale: 1 }
  if (w <= 0 || h <= 0) return { tx: size.w / 2, ty: size.h / 2, scale: 1 }
  const scale = clampScale(Math.min((size.w * (1 - padding * 2)) / w, (size.h * (1 - padding * 2)) / h, 1.5))
  return {
    scale,
    tx: size.w / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    ty: size.h / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  }
}

/** World point (x, y) in the middle of the screen at `scale`. */
export function focusViewport(x: number, y: number, size: Size, scale: number): Viewport {
  const s = clampScale(scale)
  return { scale: s, tx: size.w / 2 - x * s, ty: size.h / 2 - y * s }
}

/** Zoom by `factor` keeping the screen point (cx, cy) fixed. */
export function zoomViewport(current: Viewport, factor: number, cx: number, cy: number): Viewport {
  const scale = clampScale(current.scale * factor)
  const k = scale / current.scale
  return { scale, tx: cx - (cx - current.tx) * k, ty: cy - (cy - current.ty) * k }
}

export function screenToWorld(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: (x - viewport.tx) / viewport.scale, y: (y - viewport.ty) / viewport.scale }
}
