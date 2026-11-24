import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScanEdge, ScanNode } from '@/api/scan'
import { createLayout, seedPositions, topologyKey, type Positions } from './layout'

/** JS time spent on the simulation per slice; the rest of each frame stays free for touches and rendering. */
const SLICE_MS = 9
const SLICE_GAP_MS = 24

export interface GraphLayout {
  /** A new Map each time it is published; missing ids have not been laid out yet. */
  positions: Positions
  /** True while the simulation is still cooling. */
  settling: boolean
}

/**
 * Lays out the whole graph with d3-force, off the render path: the simulation
 * is advanced in short timer slices and its positions are published after
 * each slice, so the picture is seen settling. When the scan adds nodes, the
 * run restarts from the positions already on screen at low energy, with new
 * nodes seeded beside a neighbour: the picture grows instead of reshuffling.
 */
export function useGraphLayout(nodes: readonly ScanNode[], edges: readonly ScanEdge[], radius: (id: string) => number): GraphLayout {
  const key = useMemo(() => topologyKey(nodes, edges), [nodes, edges])
  const latest = useRef<Positions>(new Map())
  const input = useRef({ nodes, edges, radius })
  input.current = { nodes, edges, radius }
  const [state, setState] = useState<GraphLayout>({ positions: latest.current, settling: false })

  useEffect(() => {
    const { nodes: currentNodes, edges: currentEdges, radius: currentRadius } = input.current
    if (currentNodes.length === 0) {
      latest.current = new Map()
      setState({ positions: latest.current, settling: false })
      return
    }
    const first = latest.current.size === 0
    const seeds = seedPositions(latest.current, currentNodes, currentEdges)
    const run = createLayout(currentNodes, currentEdges, seeds, { alpha: first ? 1 : 0.25, radius: currentRadius })
    latest.current = seeds
    setState({ positions: seeds, settling: true })

    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const slice = () => {
      if (cancelled) return
      const done = run.tick(40, SLICE_MS)
      latest.current = run.positions()
      setState({ positions: latest.current, settling: !done })
      if (!done) timer = setTimeout(slice, SLICE_GAP_MS)
    }
    timer = setTimeout(slice, 0)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      run.stop()
    }
  }, [key])

  return state
}
