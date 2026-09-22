import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    familyRelation: { findMany: vi.fn() },
    petOwnership: { findMany: vi.fn() },
    appUser: { findMany: vi.fn() },
  },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import { getTreeMemberIds, getFamilyTree } from "./family-tree"

type Rel = { id: string; fromId: string; toId: string; status: string; type?: string }

// Drives prismaMock.familyRelation.findMany to honour the real query shape:
// where.status is "ACCEPTED" (traversal) or { not: "REJECTED" } (render fetch),
// and where.OR = [{ fromId: { in: frontier } }, { toId: { in: frontier } }].
function mockRelations(all: Rel[]) {
  prismaMock.familyRelation.findMany.mockImplementation(
    ({ where }: { where: { type?: { in: string[] }; status: unknown; OR: Array<{ fromId?: { in: string[] }; toId?: { in: string[] } }> } }) => {
      const frontier = where.OR[0].fromId!.in
      const statusOk = (r: Rel) =>
        where.status === "ACCEPTED" ? r.status === "ACCEPTED" : r.status !== "REJECTED"
      return Promise.resolve(
        all
          .filter((r) =>
            statusOk(r) &&
            (!where.type || where.type.in.includes(r.type ?? "SIBLING")) &&
            (frontier.includes(r.fromId) || frontier.includes(r.toId)),
          )
          .map((r) => ({
            id: r.id, type: r.type ?? "SIBLING", subtype: null,
            fromId: r.fromId, toId: r.toId,
            startDate: null, endDate: null,
            status: r.status, requestedById: null,
          })),
      )
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.petOwnership.findMany.mockResolvedValue([])
  prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(
      where.id.in.map((id) => ({
        id, firstName: "f", lastName: "l", maidenName: null, nickname: null,
        gender: null, avatarUrl: null, birthDate: null, birthPlace: null, birthCountry: null,
        deathDate: null, deathPlace: null, deathCountry: null, role: "APP_USER",
      })),
    ),
  )
})

// Tree: ROOT —ACCEPTED— G(host); ROOT —PENDING— S(tranger); S —ACCEPTED— SP (S's own subtree).
const TREE: Rel[] = [
  { id: "r1", fromId: "ROOT", toId: "G",  status: "ACCEPTED" },
  { id: "r2", fromId: "ROOT", toId: "S",  status: "PENDING" },
  { id: "r3", fromId: "S",    toId: "SP", status: "ACCEPTED" },
]

describe("getTreeMemberIds — ACCEPTED-only membership", () => {
  it("excludes a pending invitee (and their subtree) from the membership set", async () => {
    mockRelations(TREE)

    const ids = await getTreeMemberIds("ROOT")

    expect(ids).toEqual(new Set(["ROOT", "G"])) // S (pending) and SP (S's subtree) are NOT members
  })

  it("never traverses a legacy PET_OF edge", async () => {
    mockRelations([
      { id: "pet-link", fromId: "PET", toId: "ROOT", status: "ACCEPTED", type: "PET_OF" },
      { id: "other-family", fromId: "PET", toId: "OTHER_OWNER", status: "ACCEPTED", type: "PET_OF" },
    ])

    const ids = await getTreeMemberIds("ROOT")

    expect(ids).toEqual(new Set(["ROOT"]))
  })
})

describe("getFamilyTree — pending invite is a boundary, not a window into the invitee's tree", () => {
  it("renders the pending invitee's node but not their subtree", async () => {
    mockRelations(TREE)

    // Viewer is the root themselves — nothing should be redacted here; this
    // test only cares about traversal/membership shape.
    const tree = await getFamilyTree("ROOT", { id: "ROOT", canManage: true })

    // ROOT + accepted member G + the pending invitee S (as a leaf), but NOT SP.
    expect(Object.keys(tree.persons).sort()).toEqual(["G", "ROOT", "S"])
    expect(tree.persons.SP).toBeUndefined()
    expect(tree.persons.S.pending).toBe(true)
    // The accepted edge + the boundary pending invite show; S's internal edge does not.
    expect(tree.relations.map((r) => r.id).sort()).toEqual(["r1", "r2"])
  })

  it("loads pet attachments without traversing through a co-owner", async () => {
    mockRelations([])
    prismaMock.petOwnership.findMany.mockResolvedValue([
      { id: "own-1", petId: "PET", ownerId: "ROOT", createdAt: new Date(0) },
    ])

    const tree = await getFamilyTree("ROOT", { id: "ROOT", canManage: true })

    expect(Object.keys(tree.persons).sort()).toEqual(["PET", "ROOT"])
    expect(tree.persons.OTHER_OWNER).toBeUndefined()
    expect(tree.petOwnerships).toEqual([
      { id: "own-1", petId: "PET", ownerId: "ROOT", createdAt: new Date(0) },
    ])
    expect(prismaMock.petOwnership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: { in: ["ROOT"] } },
    }))
  })
})

describe("getFamilyTree — redacts living relatives' PII from non-managing viewers", () => {
  const livingRow = (id: string) => ({
    id, firstName: "f", lastName: "l", maidenName: null, nickname: null,
    gender: null, avatarUrl: "https://x/y.jpg",
    birthDate: new Date("1990-05-15T00:00:00.000Z"), birthPlace: "Rio", birthCountry: "BR",
    deathDate: null, deathPlace: null, deathCountry: null,
    role: "APP_USER",
  })

  it("redacts exact birth date/place for a living relative when the viewer is neither the person nor a manager", async () => {
    mockRelations([{ id: "r1", fromId: "ROOT", toId: "LIVING", status: "ACCEPTED" }])
    prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(livingRow)),
    )

    const tree = await getFamilyTree("ROOT", { id: "some-stranger", canManage: false })

    const living = tree.persons.LIVING
    expect(living.birthDate).toBeNull()
    expect(living.birthPlace).toBeNull()
    expect(living.birthCountry).toBeNull()
    expect(living.birthYear).toBe(1990) // year survives redaction
    expect(living.avatarUrl).toBe("https://x/y.jpg") // photo is not redacted
  })

  it("does not redact when the viewer manages the tree", async () => {
    mockRelations([{ id: "r1", fromId: "ROOT", toId: "LIVING", status: "ACCEPTED" }])
    prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(livingRow)),
    )

    const tree = await getFamilyTree("ROOT", { id: "manager-id", canManage: true })

    expect(tree.persons.LIVING.birthDate).not.toBeNull()
    expect(tree.persons.LIVING.birthPlace).toBe("Rio")
  })

  it("does not redact a person's own data when they are the viewer", async () => {
    mockRelations([{ id: "r1", fromId: "ROOT", toId: "LIVING", status: "ACCEPTED" }])
    prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(livingRow)),
    )

    const tree = await getFamilyTree("ROOT", { id: "LIVING", canManage: false })

    expect(tree.persons.LIVING.birthDate).not.toBeNull()
  })

  it("never redacts a ghost or memorial, regardless of viewer", async () => {
    mockRelations([{ id: "r1", fromId: "ROOT", toId: "MEMO", status: "ACCEPTED" }])
    prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ ...livingRow(id), role: "APP_MEMO" }))),
    )

    const tree = await getFamilyTree("ROOT", { id: null, canManage: false })

    expect(tree.persons.MEMO.birthDate).not.toBeNull()
    expect(tree.persons.MEMO.birthPlace).toBe("Rio")
  })

  it("redacts a SPOUSE relation's dates when either endpoint is a redacted living person", async () => {
    const spouseRow = {
      id: "r1", type: "SPOUSE", subtype: "married",
      fromId: "ROOT", toId: "SPOUSE_ID",
      startDate: new Date("2010-06-01T00:00:00.000Z"), endDate: null,
      status: "ACCEPTED", requestedById: null,
    }
    prismaMock.familyRelation.findMany.mockImplementation(({ where }: { where: { status: unknown } }) =>
      Promise.resolve(
        where.status === "ACCEPTED"
          ? [{ fromId: spouseRow.fromId, toId: spouseRow.toId }]
          : [spouseRow],
      ),
    )
    prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(livingRow)),
    )

    const tree = await getFamilyTree("ROOT", { id: null, canManage: false })

    const spouseRel = tree.relations.find((r) => r.type === "SPOUSE")
    expect(spouseRel?.startDate).toBeNull()
  })
})
