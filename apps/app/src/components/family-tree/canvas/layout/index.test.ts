import { describe, it, expect } from "vitest"
import { computeLayout, applyPositionOverrides } from "./index"
import type { TreePerson, TreePetOwnership, TreeRelation } from "@/queries/family-tree"
import type { LaidNode } from "./index"

const person = (id: string, overrides: Partial<TreePerson> = {}): TreePerson => ({
  id,
  firstName: id,
  lastName: "Test",
  maidenName: null,
  nickname: null,
  gender: null,
  avatarUrl: null,
  birthDate: null,
  birthPlace: null,
  birthCountry: null,
  deathDate: null,
  deathPlace: null,
  deathCountry: null,
  birthYear: null,
  deathYear: null,
  petSpecies: null,
  petBreed: null,
  role: "APP_USER",
  pending: false,
  ...overrides,
})

const personsOf = (...ids: string[]): Record<string, TreePerson> =>
  Object.fromEntries(ids.map((id) => [id, person(id)]))

const parentOf = (fromId: string, toId: string): TreeRelation => ({
  id: `parent-${fromId}-${toId}`,
  type: "PARENT_OF",
  subtype: "blood",
  fromId,
  toId,
  startDate: null,
  endDate: null,
  status: "ACCEPTED",
  requestedById: null,
})

const spouseRel = (fromId: string, toId: string): TreeRelation => ({
  id: `spouse-${fromId}-${toId}`,
  type: "SPOUSE",
  subtype: "married",
  fromId,
  toId,
  startDate: null,
  endDate: null,
  status: "ACCEPTED",
  requestedById: null,
})

const petOf = (petId: string, ownerId: string): TreePetOwnership => ({
  id: `pet-${petId}-${ownerId}`,
  petId,
  ownerId,
  createdAt: new Date(0),
})

describe("computeLayout — pet attachment", () => {
  it("attaches a pet below its owner when the owner is present in this tree view", () => {
    const persons = { ...personsOf("subject"), rex: person("rex", { role: "APP_PET" }) }
    const ownerships = [petOf("rex", "subject")]

    const result = computeLayout(persons, [], "subject", new Set(), ownerships)

    const subjectNode = result.nodes.find((n) => n.personId === "subject")!
    const petNode = result.nodes.find((n) => n.personId === "rex")!
    expect(petNode).toBeDefined()
    expect(petNode.y).toBeGreaterThan(subjectNode.y)
    expect(petNode.isDuplicate).toBe(false)
    expect(result.petLines).toEqual([
      { petId: "rex", ownerId: "subject", relationId: "pet-rex-subject" },
    ])
  })

  it("never generates ancestors/descendants for a pet — PET_OF is invisible to buildFamilyGraph", () => {
    const persons = { ...personsOf("subject"), rex: person("rex", { role: "APP_PET" }) }
    const ownerships = [petOf("rex", "subject")]

    const result = computeLayout(persons, [], "subject", new Set(), ownerships)

    const petNode = result.nodes.find((n) => n.personId === "rex")!
    expect(petNode.hasCollapsible).toBe(false)
    // No parent/spouse/sibling lines were fabricated for the pet.
    expect(result.parentLines.some((l) => l.parentId === "rex" || l.childId === "rex")).toBe(false)
    expect(result.coupleLines.some((l) => l.aId === "rex" || l.bId === "rex")).toBe(false)
  })

  it("omits a pet entirely when none of its owners are present in this tree view", () => {
    const persons = { ...personsOf("subject"), rex: person("rex", { role: "APP_PET" }) }
    // Owner "stranger" isn't in `persons` at all — not reachable from this tree.
    const ownerships = [petOf("rex", "stranger")]

    const result = computeLayout(persons, [], "subject", new Set(), ownerships)

    expect(result.nodes.find((n) => n.personId === "rex")).toBeUndefined()
    expect(result.petLines).toEqual([])
  })

  it("stacks two pets of the same owner side by side without overlapping", () => {
    const persons = {
      ...personsOf("subject"),
      rex: person("rex", { role: "APP_PET" }),
      fido: person("fido", { role: "APP_PET" }),
    }
    const ownerships = [petOf("rex", "subject"), petOf("fido", "subject")]

    const result = computeLayout(persons, [], "subject", new Set(), ownerships)

    const rexNode = result.nodes.find((n) => n.personId === "rex")!
    const fidoNode = result.nodes.find((n) => n.personId === "fido")!
    expect(rexNode).toBeDefined()
    expect(fidoNode).toBeDefined()
    expect(rexNode.y).toBe(fidoNode.y)
    expect(Math.abs(rexNode.x - fidoNode.x)).toBeGreaterThan(0)
  })

  it("moves a pet away from the owner's human child row", () => {
    const persons = {
      ...personsOf("subject", "child"),
      rex: person("rex", { role: "APP_PET" }),
    }
    const relations = [parentOf("subject", "child")]
    const ownerships = [petOf("rex", "subject")]

    const result = computeLayout(persons, relations, "subject", new Set(), ownerships)
    const petNode = result.nodes.find((node) => node.personId === "rex")!
    const childNode = result.nodes.find((node) => node.personId === "child")!
    const overlaps =
      petNode.x < childNode.x + 168 &&
      petNode.x + 168 > childNode.x &&
      petNode.y < childNode.y + 72 &&
      petNode.y + 72 > childNode.y

    expect(overlaps).toBe(false)
  })

  it("anchors a co-owned pet between both owners when both are present", () => {
    const persons = {
      ...personsOf("subject", "spouse"),
      rex: person("rex", { role: "APP_PET" }),
    }
    const relations: TreeRelation[] = [
      spouseRel("subject", "spouse"),
    ]
    const ownerships = [petOf("rex", "subject"), petOf("rex", "spouse")]

    const result = computeLayout(persons, relations, "subject", new Set(), ownerships)

    const petNode = result.nodes.find((n) => n.personId === "rex")!
    expect(petNode).toBeDefined()
    expect(result.petLines).toHaveLength(2)
    expect(result.petLines.map((l) => l.ownerId).sort()).toEqual(["spouse", "subject"])
  })
})

describe("computeLayout — pedigree collapse", () => {
  it("keeps a normal multi-generation tree free of duplicates", () => {
    const ids = ["subject", "father", "mother", "fp", "fm", "mp", "mm"]
    const persons = personsOf(...ids)
    const relations: TreeRelation[] = [
      parentOf("father", "subject"),
      parentOf("mother", "subject"),
      spouseRel("father", "mother"),
      parentOf("fp", "father"),
      parentOf("fm", "father"),
      spouseRel("fp", "fm"),
      parentOf("mp", "mother"),
      parentOf("mm", "mother"),
      spouseRel("mp", "mm"),
    ]

    const result = computeLayout(persons, relations, "subject")

    expect(result.nodes.some((n) => n.isDuplicate)).toBe(false)
    for (const id of ids) {
      expect(result.nodes.filter((n) => n.personId === id)).toHaveLength(1)
    }
    expect(Number.isFinite(result.bounds.minX)).toBe(true)
    expect(Number.isFinite(result.bounds.maxX)).toBe(true)
  })

  it("renders a great-grandparent shared by both sides of a cousin marriage as one primary occurrence plus one duplicate stub, routing each ancestor edge to the correct occurrence", () => {
    // f and m are subject's parents; fp/mp are their respective parents. Both
    // fp and mp are ggp's children, but through TWO DIFFERENT marriages
    // (gspouse1 / gspouse2) — so fp and mp land in two distinct FamilyUnits
    // rather than being (accidentally) grouped as full siblings, which keeps
    // this fixture isolated to exactly the convergence being tested, with no
    // incidental interaction from the "collateral sibling" discovery pass.
    const persons = personsOf("subject", "f", "m", "fp", "mp", "ggp", "gspouse1", "gspouse2")
    const relations: TreeRelation[] = [
      parentOf("f", "subject"),
      parentOf("m", "subject"),
      spouseRel("f", "m"),
      parentOf("fp", "f"),
      parentOf("mp", "m"),
      parentOf("ggp", "fp"),
      parentOf("gspouse1", "fp"),
      parentOf("ggp", "mp"),
      parentOf("gspouse2", "mp"),
    ]

    const result = computeLayout(persons, relations, "subject")

    const ggpNodes = result.nodes.filter((n) => n.personId === "ggp")
    expect(ggpNodes).toHaveLength(2)
    const primary   = ggpNodes.find((n) => !n.isDuplicate)
    const duplicate = ggpNodes.find((n) => n.isDuplicate)
    expect(primary?.id).toBe("ggp")
    expect(duplicate?.id).toBeDefined()
    expect(duplicate?.id).not.toBe("ggp")

    // Nobody else gets swept up by the fix — it must not over-trigger on
    // branches that never actually converge.
    for (const id of ["subject", "f", "m", "fp", "mp", "gspouse1", "gspouse2"]) {
      expect(result.nodes.filter((n) => n.personId === id)).toHaveLength(1)
    }

    // f's branch reaches ggp first (husband processed before wife), so the
    // ggp->fp edge resolves to the primary occurrence, and the ggp->mp edge —
    // discovered second, via the wife's branch — is routed to the duplicate
    // stub instead of silently landing on the primary's (visually distant)
    // position.
    const edgeToFp = result.parentLines.find((l) => l.childId === "fp" && l.parentId.startsWith("ggp"))
    const edgeToMp = result.parentLines.find((l) => l.childId === "mp" && l.parentId.startsWith("ggp"))
    expect(edgeToFp?.parentId).toBe(primary!.id)
    expect(edgeToMp?.parentId).toBe(duplicate!.id)
  })

  it("dedupes a person reached both as a direct child and as their first cousin's spouse", () => {
    // father and his siblings auntA/auntB are gp's children. auntA's child
    // (cousinA1) marries auntB's child (cousinB1); their mutual child is
    // sharedGC. Whichever cousin's aunt/uncle branch the layout visits
    // SECOND collides with that cousin already having been placed as a
    // spouse-card in the FIRST branch — the exact node depends on the aunts/
    // uncles loop's placement order (auntB before auntA here, since a
    // single-parent subject defaults that loop to "onLeft", which iterates
    // youngest-first), but a collision is guaranteed either way. This is the
    // descendant-side / spouse-card convergence the ancestor-side fix alone
    // does not cover (see buildCoupleSlot).
    const persons = personsOf(
      "subject", "father", "gp", "auntA", "auntB", "cousinA1", "cousinB1", "sharedGC",
    )
    const relations: TreeRelation[] = [
      parentOf("father", "subject"),
      parentOf("gp", "father"),
      parentOf("gp", "auntA"),
      parentOf("gp", "auntB"),
      parentOf("auntA", "cousinA1"),
      parentOf("auntB", "cousinB1"),
      spouseRel("cousinA1", "cousinB1"),
      parentOf("cousinA1", "sharedGC"),
      parentOf("cousinB1", "sharedGC"),
    ]

    const result = computeLayout(persons, relations, "subject")

    const cousinNodes = ["cousinA1", "cousinB1"].map((id) => ({
      id,
      occurrences: result.nodes.filter((n) => n.personId === id),
    }))
    // Exactly one of the two cousins ends up duplicated (whichever aunt/
    // uncle branch is visited second) — never both, and never neither.
    const duplicated = cousinNodes.filter((c) => c.occurrences.length === 2)
    const single      = cousinNodes.filter((c) => c.occurrences.length === 1)
    expect(duplicated).toHaveLength(1)
    expect(single).toHaveLength(1)
    expect(duplicated[0].occurrences.filter((n) => n.isDuplicate)).toHaveLength(1)
    expect(duplicated[0].occurrences.filter((n) => !n.isDuplicate)).toHaveLength(1)

    // The shared child and both aunts render once regardless — only a
    // cousin genuinely reached via two independent branches does not.
    for (const id of ["auntA", "auntB", "sharedGC"]) {
      expect(result.nodes.filter((n) => n.personId === id)).toHaveLength(1)
    }
  })

  it("terminates on an interlocking cycle that only the shared dedup state — not the per-branch visited clone — can catch", () => {
    // Genealogically impossible (p1 and p2 are each other's parent, while
    // also being subject's parent couple), but this shape is exactly what a
    // PENDING-vs-PENDING race in the DB-layer cycle guard could let through.
    // p1's and p2's ancestor climbs run on independent `visited` clones
    // (see layoutAncestorCoupleBlock), so only the shared, never-cloned
    // `dedup` state is positioned to catch the cross-branch loop.
    const persons = personsOf("subject", "p1", "p2")
    const relations: TreeRelation[] = [
      parentOf("p1", "subject"),
      parentOf("p2", "subject"),
      spouseRel("p1", "p2"),
      parentOf("p2", "p1"),
      parentOf("p1", "p2"),
    ]

    const result = computeLayout(persons, relations, "subject")

    expect(Number.isFinite(result.bounds.minX)).toBe(true)
    expect(Number.isFinite(result.bounds.maxX)).toBe(true)
    expect(Number.isFinite(result.bounds.minY)).toBe(true)
    expect(Number.isFinite(result.bounds.maxY)).toBe(true)

    expect(result.nodes.filter((n) => n.personId === "p1")).toHaveLength(1)
    const p2Nodes = result.nodes.filter((n) => n.personId === "p2")
    expect(p2Nodes).toHaveLength(2)
    expect(p2Nodes.some((n) => n.isDuplicate)).toBe(true)
  })
})

describe("computeLayout — collapse", () => {
  // subject -> child1 (descendant side); father -> grandpa (ancestor side,
  // via subject's own parent father).
  const persons = personsOf("subject", "child1", "father", "grandpa")
  const relations: TreeRelation[] = [
    parentOf("subject", "child1"),
    parentOf("father", "subject"),
    parentOf("grandpa", "father"),
  ]

  it("marks hasCollapsible without collapsing anything when collapsedIds is omitted", () => {
    const result = computeLayout(persons, relations, "subject")

    for (const id of ["subject", "father", "child1", "grandpa"]) {
      expect(result.nodes.find((n) => n.personId === id)).toBeDefined()
    }
    const subject = result.nodes.find((n) => n.personId === "subject")!
    expect(subject).toMatchObject({ hasCollapsible: true, isCollapsed: false, collapseDirection: "down" })
    const father = result.nodes.find((n) => n.personId === "father")!
    expect(father).toMatchObject({ hasCollapsible: true, isCollapsed: false, collapseDirection: "up" })
    // Leaves have nothing to collapse in the direction they were reached.
    const child1 = result.nodes.find((n) => n.personId === "child1")!
    expect(child1.hasCollapsible).toBe(false)
    const grandpa = result.nodes.find((n) => n.personId === "grandpa")!
    expect(grandpa.hasCollapsible).toBe(false)
  })

  it("hides a person's descendants when their id is collapsed, without touching the ancestor side", () => {
    const result = computeLayout(persons, relations, "subject", new Set(["subject"]))

    expect(result.nodes.find((n) => n.personId === "child1")).toBeUndefined()
    expect(result.nodes.find((n) => n.personId === "father")).toBeDefined()
    expect(result.nodes.find((n) => n.personId === "grandpa")).toBeDefined()
    const subject = result.nodes.find((n) => n.personId === "subject")!
    expect(subject).toMatchObject({ hasCollapsible: true, isCollapsed: true, collapseDirection: "down" })
  })

  it("hides a person's ancestors when their id is collapsed, without touching the descendant side", () => {
    const result = computeLayout(persons, relations, "subject", new Set(["father"]))

    expect(result.nodes.find((n) => n.personId === "grandpa")).toBeUndefined()
    expect(result.nodes.find((n) => n.personId === "child1")).toBeDefined()
    const father = result.nodes.find((n) => n.personId === "father")!
    expect(father).toMatchObject({ hasCollapsible: true, isCollapsed: true, collapseDirection: "up" })
  })

  it("ignores a collapsedId for a person with nothing to collapse in that direction", () => {
    // child1 has no children of their own — collapsing them is a no-op.
    const result = computeLayout(persons, relations, "subject", new Set(["child1"]))

    const child1 = result.nodes.find((n) => n.personId === "child1")!
    expect(child1).toMatchObject({ hasCollapsible: false, isCollapsed: false })
  })
})

describe("applyPositionOverrides", () => {
  const node = (over: Partial<LaidNode> = {}): LaidNode => ({
    id: "alice", personId: "alice", isDuplicate: false, x: 100, y: 200,
    hasCollapsible: false, isCollapsed: false, collapseDirection: "down",
    ...over,
  })

  it("nudges a node whose override generation matches the live layout", () => {
    const nodes = [node()]
    const generation = new Map([["alice", -1]])
    const overrides = { alice: { dx: 10, dy: -5, generation: -1 } }

    const result = applyPositionOverrides(nodes, overrides, generation)

    expect(result[0]).toMatchObject({ x: 110, y: 195 })
  })

  it("leaves a node unchanged when there is no override for it", () => {
    const nodes = [node()]
    const generation = new Map([["alice", -1]])

    const result = applyPositionOverrides(nodes, {}, generation)

    expect(result[0]).toMatchObject({ x: 100, y: 200 })
  })

  it("ignores a stale override — saved at a generation the person no longer occupies", () => {
    // e.g. a relation change moved alice from gen -1 to gen -2 after the
    // override was saved; applying the old dx/dy would misplace her
    // relative to her new family unit instead of the old one.
    const nodes = [node()]
    const generation = new Map([["alice", -2]])
    const overrides = { alice: { dx: 10, dy: -5, generation: -1 } }

    const result = applyPositionOverrides(nodes, overrides, generation)

    expect(result[0]).toMatchObject({ x: 100, y: 200 })
  })

  it("never offsets a duplicate (pedigree-collapse stub), even if an override exists for its personId", () => {
    const nodes = [node({ id: "alice~dup1", isDuplicate: true })]
    const generation = new Map([["alice", -1]])
    const overrides = { alice: { dx: 10, dy: -5, generation: -1 } }

    const result = applyPositionOverrides(nodes, overrides, generation)

    expect(result[0]).toMatchObject({ x: 100, y: 200, isDuplicate: true })
  })
})
