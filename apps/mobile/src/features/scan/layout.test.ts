import { describe, expect, it } from 'vitest'
import { createLayout, SEED_DISTANCE, seedPositions, topologyKey } from './layout'
import { fitViewport, focusViewport, hitTest, zoomLevel } from './viewport'

const n = (id: string) => ({ id })
const e = (from: string, to: string) => ({ from, to })
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('seedPositions', () => {
  const previous = new Map([
    ['a', { x: 100, y: -40 }],
    ['b', { x: -250, y: 310 }],
  ])

  it('keeps every existing position exactly', () => {
    const seeded = seedPositions(previous, [n('a'), n('b'), n('c')], [e('a', 'b'), e('c', 'b')])
    expect(seeded.get('a')).toEqual({ x: 100, y: -40 })
    expect(seeded.get('b')).toEqual({ x: -250, y: 310 })
  })

  it('places a new node SEED_DISTANCE from its positioned neighbour, whichever way the edge points', () => {
    const seeded = seedPositions(previous, [n('a'), n('b'), n('c'), n('d')], [e('c', 'b'), e('a', 'd')])
    expect(distance(seeded.get('c')!, previous.get('b')!)).toBeCloseTo(SEED_DISTANCE, 6)
    expect(distance(seeded.get('d')!, previous.get('a')!)).toBeCloseTo(SEED_DISTANCE, 6)
    // …and therefore nowhere near the other, unrelated node 400+ units away.
    expect(distance(seeded.get('c')!, previous.get('a')!)).toBeGreaterThan(300)
  })

  it('grows a chain of new nodes outward from the existing picture', () => {
    // a ── x ── y ── z : only `a` is positioned; z is listed before its neighbours.
    const seeded = seedPositions(previous, [n('a'), n('z'), n('y'), n('x')], [e('a', 'x'), e('x', 'y'), e('y', 'z')])
    expect(distance(seeded.get('x')!, previous.get('a')!)).toBeCloseTo(SEED_DISTANCE, 6)
    expect(distance(seeded.get('y')!, seeded.get('x')!)).toBeCloseTo(SEED_DISTANCE, 6)
    expect(distance(seeded.get('z')!, seeded.get('y')!)).toBeCloseTo(SEED_DISTANCE, 6)
  })

  it('gives every node a finite position on a first layout and when a new node is unconnected', () => {
    const first = seedPositions(new Map(), [n('a'), n('b'), n('c')], [e('a', 'b')])
    expect(first.size).toBe(3)
    expect(first.get('a')).toEqual({ x: 0, y: 0 })
    expect(distance(first.get('b')!, first.get('a')!)).toBeCloseTo(SEED_DISTANCE, 6)
    for (const point of first.values()) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)

    const island = seedPositions(previous, [n('a'), n('b'), n('lonely')], [])
    expect(island.get('a')).toEqual({ x: 100, y: -40 })
    expect(Number.isFinite(island.get('lonely')!.x)).toBe(true)
  })

  it('drops nodes that left the graph and is deterministic', () => {
    const nodes = [n('a'), n('c')]
    const edges = [e('a', 'c')]
    const once = seedPositions(previous, nodes, edges)
    expect([...once.keys()]).toEqual(['a', 'c'])
    expect(seedPositions(previous, nodes, edges)).toEqual(once)
  })

  it('does not mutate the previous positions', () => {
    seedPositions(previous, [n('a'), n('c')], [e('a', 'c')])
    expect([...previous.keys()]).toEqual(['a', 'b'])
  })
})

describe('createLayout', () => {
  it('converges within the default cooling schedule and separates the nodes', () => {
    const nodes = ['hub', 'a', 'b', 'c', 'd'].map(n)
    const edges = ['a', 'b', 'c', 'd'].map((id) => e(id, 'hub'))
    const run = createLayout(nodes, edges, seedPositions(new Map(), nodes, edges))
    expect(run.done()).toBe(false)
    // d3-force cools from alpha 1 to below 0.001 in 300 ticks.
    expect(run.tick(100)).toBe(false)
    expect(run.tick(400)).toBe(true)
    const positions = run.positions()
    expect(positions.size).toBe(5)
    const ids = [...positions.keys()]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        // Collision radius is 6 + 5 per node, so centres end at least ~22 apart.
        expect(distance(positions.get(ids[i])!, positions.get(ids[j])!)).toBeGreaterThan(20)
      }
    }
  })

  it('moves existing nodes only slightly when one node is added at low energy', () => {
    const nodes = ['hub', 'a', 'b', 'c', 'd'].map(n)
    const edges = ['a', 'b', 'c', 'd'].map((id) => e(id, 'hub'))
    const first = createLayout(nodes, edges, seedPositions(new Map(), nodes, edges))
    first.tick(400)
    const settled = first.positions()

    const grownNodes = [...nodes, n('new')]
    const grownEdges = [...edges, e('new', 'a')]
    const second = createLayout(grownNodes, grownEdges, seedPositions(settled, grownNodes, grownEdges), { alpha: 0.25 })
    second.tick(400)
    const after = second.positions()
    // The whole five-node picture spans roughly 100 units; nobody jumps across it.
    for (const id of ['hub', 'a', 'b', 'c', 'd']) expect(distance(after.get(id)!, settled.get(id)!)).toBeLessThan(45)
  })
})

describe('topologyKey', () => {
  it('is stable for an unchanged graph and changes with nodes or edges', () => {
    const key = topologyKey([n('a'), n('b')], [e('a', 'b')])
    expect(topologyKey([n('a'), n('b')], [e('a', 'b')])).toBe(key)
    expect(topologyKey([n('a'), n('b'), n('c')], [e('a', 'b')])).not.toBe(key)
    expect(topologyKey([n('a'), n('b')], [])).not.toBe(key)
  })
})

describe('viewport', () => {
  it('fits and centres a set of points', () => {
    // 400×200 of content in a 300×300 view with 50 padding: scale = min(200/400, 200/200) = 0.5.
    const viewport = fitViewport(
      [
        { x: -200, y: 0 },
        { x: 200, y: 200 },
      ],
      { w: 300, h: 300 },
      50,
    )
    expect(viewport).toEqual({ scale: 0.5, tx: 150, ty: 100 })
  })

  it('never zooms in past 1.5× and copes with no points', () => {
    expect(fitViewport([{ x: 10, y: 10 }], { w: 400, h: 400 }).scale).toBe(1.5)
    expect(fitViewport([], { w: 400, h: 200 })).toEqual({ tx: 200, ty: 100, scale: 1 })
  })

  it('centres one world point', () => {
    expect(focusViewport({ x: 100, y: 50 }, { w: 400, h: 300 }, 2)).toEqual({ scale: 2, tx: 0, ty: 50 })
  })

  it('maps zoom factors to label levels', () => {
    expect([0.3, 0.6, 0.99, 1, 1.59, 1.6, 4].map(zoomLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })

  it('hit-tests the nearest node within reach', () => {
    const targets = [
      { id: 'a', x: 0, y: 0, r: 5 },
      { id: 'b', x: 20, y: 0, r: 5 },
    ]
    expect(hitTest(targets, 2, 0, 0)).toBe('a')
    expect(hitTest(targets, 12, 0, 10)).toBe('b')
    expect(hitTest(targets, 10, 0, 2)).toBeNull()
    expect(hitTest(targets, 0, 40, 10)).toBeNull()
  })
})
