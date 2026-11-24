// Force-directed layout (d3-force) for the scan graph. Pure: no React, no
// timers. The hook in ./useGraphLayout drives `tick` in small time slices.
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Point } from './viewport'

export type Positions = Map<string, Point>

interface NodeLike {
  id: string
}

interface EdgeLike {
  from: string
  to: string
}

/** How far from its neighbour a new node is first placed (layout units). */
export const SEED_DISTANCE = 30
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Stable pseudo-random angle from an id, so re-seeding the same graph gives the same picture. */
function angleOf(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2
}

/**
 * Starting positions for a layout run that must not reshuffle what the user
 * is already looking at:
 *  - a node that already has a position keeps it exactly;
 *  - a new node starts SEED_DISTANCE away from a neighbour that has a position
 *    (also one seeded earlier in this call), at an angle derived from its id;
 *  - a new node with no positioned neighbour goes on a spiral around the origin.
 * Nodes that left the graph are dropped.
 */
export function seedPositions(previous: ReadonlyMap<string, Point>, nodes: readonly NodeLike[], edges: readonly EdgeLike[]): Positions {
  const ids = new Set(nodes.map((node) => node.id))
  const neighbours = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    const list = neighbours.get(a)
    if (list) list.push(b)
    else neighbours.set(a, [b])
  }
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue
    link(edge.from, edge.to)
    link(edge.to, edge.from)
  }

  const positions: Positions = new Map()
  for (const node of nodes) {
    const kept = previous.get(node.id)
    if (kept && Number.isFinite(kept.x) && Number.isFinite(kept.y)) positions.set(node.id, { x: kept.x, y: kept.y })
  }

  let pending = nodes.filter((node) => !positions.has(node.id))
  // Each pass places the nodes that touch something already placed, so a chain
  // of new nodes grows outward from the existing picture.
  while (pending.length > 0) {
    const waiting: NodeLike[] = []
    for (const node of pending) {
      const anchorId = (neighbours.get(node.id) ?? []).find((id) => positions.has(id))
      if (anchorId === undefined) {
        waiting.push(node)
        continue
      }
      const anchor = positions.get(anchorId)!
      const angle = angleOf(node.id)
      positions.set(node.id, { x: anchor.x + Math.cos(angle) * SEED_DISTANCE, y: anchor.y + Math.sin(angle) * SEED_DISTANCE })
    }
    if (waiting.length === pending.length) {
      // Nothing left is connected to the placed part: start one on the spiral and go round again.
      const node = waiting.shift()!
      const index = positions.size
      const radius = SEED_DISTANCE * Math.sqrt(index)
      positions.set(node.id, { x: Math.cos(index * GOLDEN_ANGLE) * radius, y: Math.sin(index * GOLDEN_ANGLE) * radius })
    }
    pending = waiting
  }
  return positions
}

interface SimNode extends SimulationNodeDatum {
  id: string
  r: number
}

export interface LayoutRun {
  /** Advance up to `maxTicks` ticks or until `budgetMs` has elapsed. Returns true once converged. */
  tick: (maxTicks: number, budgetMs?: number) => boolean
  done: () => boolean
  positions: () => Positions
  stop: () => void
}

export interface LayoutOptions {
  /** Starting energy: 1 for a first layout, lower to settle additions gently. */
  alpha?: number
  radius?: (id: string) => number
}

/**
 * A stopped simulation over the whole graph, seeded from `seeds`. The caller
 * ticks it; nothing here schedules work.
 */
export function createLayout(nodes: readonly NodeLike[], edges: readonly EdgeLike[], seeds: ReadonlyMap<string, Point>, options: LayoutOptions = {}): LayoutRun {
  const simNodes: SimNode[] = nodes.map((node) => {
    const seed = seeds.get(node.id)
    return { id: node.id, x: seed?.x ?? 0, y: seed?.y ?? 0, r: options.radius?.(node.id) ?? 6 }
  })
  const known = new Set(simNodes.map((node) => node.id))
  const links: SimulationLinkDatum<SimNode>[] = edges
    .filter((edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to)
    .map((edge) => ({ source: edge.from, target: edge.to }))

  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((node) => node.id)
        .distance(46),
    )
    .force('charge', forceManyBody<SimNode>().strength(-110).distanceMax(420).theta(0.95))
    .force('collide', forceCollide<SimNode>().radius((node) => node.r + 5))
    .force('center', forceCenter(0, 0))
    // Keeps unconnected fragments from drifting off to infinity.
    .force('x', forceX<SimNode>(0).strength(0.035))
    .force('y', forceY<SimNode>(0).strength(0.035))
    .alpha(options.alpha ?? 1)
    .stop()

  const done = () => simulation.alpha() < simulation.alphaMin()
  return {
    tick(maxTicks, budgetMs) {
      const started = Date.now()
      for (let i = 0; i < maxTicks && !done(); i++) {
        simulation.tick()
        if (budgetMs !== undefined && Date.now() - started >= budgetMs) break
      }
      return done()
    },
    done,
    positions() {
      const result: Positions = new Map()
      for (const node of simNodes) result.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 })
      return result
    },
    stop() {
      simulation.stop()
    },
  }
}

/** Changes whenever the set of nodes or edges changes; identical for a re-fetched, unchanged graph. */
export function topologyKey(nodes: readonly NodeLike[], edges: readonly EdgeLike[]): string {
  return `${nodes.map((node) => node.id).join(',')}|${edges.map((edge) => `${edge.from}>${edge.to}`).join(',')}`
}
