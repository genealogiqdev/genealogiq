// Step 1 of the layout pipeline (see plan):
// Build a forest of FamilyUnits — couples (or single parents) + their children —
// from the raw persons/relations data. Everything downstream layouts in terms
// of these units rather than individual people, which is what gives us
// "subtree rigidity" (the property the old algorithm lacked).

import { timeOf, type TreePerson, type TreeRelation } from "./types"

export interface FamilyUnit {
  /** Synthetic id, "fu_<sortedParentIds>" — deterministic per couple. */
  id:       string
  /** 1 or 2 person ids. 2 = couple, 1 = single parent. */
  parents:  string[]
  /** Person ids of all biological children, age-sorted (oldest first). */
  children: string[]
}

export interface FamilyGraph {
  /** Every unit keyed by its synthetic id. */
  units:         Map<string, FamilyUnit>
  /** For each person, the unit they were born into (where they appear in `children`). */
  birthUnit:     Map<string, FamilyUnit | null>
  /** For each person, the "primary" (active) unit they are a parent in. */
  marriageUnit:  Map<string, FamilyUnit | null>
  /** For each person, ALL units they are a parent in, sorted chronologically
   *  (oldest marriage first). Length >= 1 when present. */
  marriageUnits: Map<string, FamilyUnit[]>
  /** Active spouse for each person, or null if single / no active marriage. */
  spouseOf:      Map<string, string | null>
  /** Siblings (same birth unit) of each person, age-sorted, excluding self. */
  siblingsOf:    Map<string, string[]>
  /** Subtype of the spouse relation, for line styling later. */
  spouseSubtype: Map<string, string>
}

const ageMs = (persons: Record<string, TreePerson>, id: string) =>
  timeOf(persons[id]?.birthDate) ?? Number.POSITIVE_INFINITY

export function buildFamilyGraph(
  persons:   Record<string, TreePerson>,
  relations: TreeRelation[],
): FamilyGraph {
  // 1. Parent set per child (from PARENT_OF edges).
  const parentSetByChild = new Map<string, Set<string>>()
  for (const r of relations) {
    if (r.type !== "PARENT_OF") continue
    let set = parentSetByChild.get(r.toId)
    if (!set) { set = new Set(); parentSetByChild.set(r.toId, set) }
    set.add(r.fromId)
  }

  // 2. Group children by their parent set → FamilyUnit per group.
  //    Key is sorted parent ids joined by "|", deterministic.
  const childrenByKey = new Map<string, { parents: string[]; children: string[] }>()
  for (const [childId, parentSet] of parentSetByChild.entries()) {
    const parentsSorted = Array.from(parentSet).sort()
    const key = parentsSorted.join("|")
    let group = childrenByKey.get(key)
    if (!group) {
      group = { parents: parentsSorted, children: [] }
      childrenByKey.set(key, group)
    }
    group.children.push(childId)
  }

  // 3. Materialise FamilyUnits with age-sorted children.
  const units = new Map<string, FamilyUnit>()
  for (const [key, group] of childrenByKey.entries()) {
    group.children.sort((a, b) => ageMs(persons, a) - ageMs(persons, b))
    units.set(`fu_${key}`, {
      id:       `fu_${key}`,
      parents:  group.parents,
      children: group.children,
    })
  }

  // 4. Index: birthUnit per person.
  const birthUnit = new Map<string, FamilyUnit | null>()
  for (const u of units.values()) {
    for (const c of u.children) birthUnit.set(c, u)
  }
  for (const pid of Object.keys(persons)) {
    if (!birthUnit.has(pid)) birthUnit.set(pid, null)
  }

  // 5. Index: marriageUnit per person. A person can appear in multiple units
  //    as a parent (sequential marriages) — pick the one corresponding to
  //    their active spouse (computed next). If they're a parent in exactly
  //    one unit, that's it.
  const marriageUnitCandidates = new Map<string, FamilyUnit[]>()
  for (const u of units.values()) {
    for (const p of u.parents) {
      const arr = marriageUnitCandidates.get(p) ?? []
      arr.push(u)
      marriageUnitCandidates.set(p, arr)
    }
  }

  // 6. Spouse selection — pick the active SPOUSE per person.
  //    Preference: status="ACCEPTED" AND no endDate, then most recent endDate.
  type SpouseChoice = { partner: string; subtype: string; score: number }
  const spouseChoiceFor = new Map<string, SpouseChoice>()

  for (const r of relations) {
    if (r.type !== "SPOUSE") continue
    if (r.status === "REJECTED") continue
    const accepted = r.status !== "PENDING"
    const endMs    = timeOf(r.endDate)
    const active   = endMs === null
    // Higher score = preferred. accepted+active > accepted+ended > pending+active > pending+ended.
    const score =
      (accepted ? 1000 : 0) +
      (active   ? 500  : (endMs !== null ? endMs / 1e10 : 0))

    for (const [a, b] of [[r.fromId, r.toId], [r.toId, r.fromId]] as const) {
      const cur = spouseChoiceFor.get(a)
      if (!cur || score > cur.score) {
        spouseChoiceFor.set(a, { partner: b, subtype: r.subtype ?? "married", score })
      }
    }
  }

  const spouseOf      = new Map<string, string | null>()
  const spouseSubtype = new Map<string, string>()
  for (const pid of Object.keys(persons)) {
    const c = spouseChoiceFor.get(pid)
    spouseOf.set(pid, c?.partner ?? null)
    if (c) spouseSubtype.set(pid, c.subtype)
  }

  // 7a. SPOUSE start date for each unordered pair (used to sort marriageUnits).
  //     Returns Infinity when no SPOUSE relation is found (single-parent unit,
  //     or PARENT_OF without a SPOUSE record) so those sort to the end.
  const spouseStart = new Map<string, number>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  for (const r of relations) {
    if (r.type !== "SPOUSE") continue
    if (r.status === "REJECTED") continue
    const t = timeOf(r.startDate) ?? Number.POSITIVE_INFINITY
    const k = pairKey(r.fromId, r.toId)
    const cur = spouseStart.get(k)
    if (cur === undefined || t < cur) spouseStart.set(k, t)
  }
  const unitStart = (u: FamilyUnit): number => {
    if (u.parents.length !== 2) return Number.POSITIVE_INFINITY
    return spouseStart.get(pairKey(u.parents[0], u.parents[1])) ?? Number.POSITIVE_INFINITY
  }

  // 7b. Finalise marriageUnit: pick the unit whose other parent matches the active spouse.
  //     If single-parent unit (no spouse stored), still pick the unit if there's exactly one.
  const marriageUnit = new Map<string, FamilyUnit | null>()
  const marriageUnits = new Map<string, FamilyUnit[]>()
  for (const pid of Object.keys(persons)) {
    const cands = marriageUnitCandidates.get(pid) ?? []
    // Sort cands chronologically (oldest start first; unknown last).
    const sorted = [...cands].sort((a, b) => unitStart(a) - unitStart(b))
    marriageUnits.set(pid, sorted)
    if (sorted.length === 0) { marriageUnit.set(pid, null); continue }
    if (sorted.length === 1) { marriageUnit.set(pid, sorted[0]); continue }
    const spouse = spouseOf.get(pid)
    if (spouse) {
      const match = sorted.find((u) => u.parents.includes(spouse))
      marriageUnit.set(pid, match ?? sorted[0])
    } else {
      marriageUnit.set(pid, sorted[0])
    }
  }

  // 8. Siblings: same birthUnit, plus explicit SIBLING relations for people
  //    whose shared parents aren't recorded yet. Dedupe and age-sort.
  const siblingSets = new Map<string, Set<string>>()
  const ensureSet = (k: string) => {
    let s = siblingSets.get(k)
    if (!s) { s = new Set(); siblingSets.set(k, s) }
    return s
  }
  for (const pid of Object.keys(persons)) {
    const bu = birthUnit.get(pid) ?? null
    if (!bu) { ensureSet(pid); continue }
    const s = ensureSet(pid)
    for (const c of bu.children) if (c !== pid) s.add(c)
  }
  for (const r of relations) {
    if (r.type !== "SIBLING") continue
    if (r.status === "REJECTED") continue
    if (!persons[r.fromId] || !persons[r.toId]) continue
    ensureSet(r.fromId).add(r.toId)
    ensureSet(r.toId).add(r.fromId)
  }
  const siblingsOf = new Map<string, string[]>()
  for (const [pid, set] of siblingSets.entries()) {
    const arr = Array.from(set)
    arr.sort((a, b) => ageMs(persons, a) - ageMs(persons, b))
    siblingsOf.set(pid, arr)
  }

  return { units, birthUnit, marriageUnit, marriageUnits, spouseOf, siblingsOf, spouseSubtype }
}
