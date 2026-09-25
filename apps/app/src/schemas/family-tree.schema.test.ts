import { describe, it, expect } from "vitest"
import { identityTranslator } from "@genealogiq/core"
import {
  getAddRelationSchema,
  getAddGhostRelativeSchema,
  getUpdateMemberSchema,
  getUpdateRelationSchema,
} from "./family-tree.schema"

const addRelationSchema = getAddRelationSchema(identityTranslator)
const addGhostSchema = getAddGhostRelativeSchema(identityTranslator)
const updateMemberSchema = getUpdateMemberSchema(identityTranslator)
const updateRelationSchema = getUpdateRelationSchema(identityTranslator)

const FROM = "cfromaaaaaaaaaaaaaaaaaaaaa"
const TO = "ctoaaaaaaaaaaaaaaaaaaaaaaa"
const ANCHOR = "canchoraaaaaaaaaaaaaaaaaaa"

describe("getAddRelationSchema", () => {
  const base = { fromId: FROM, toId: TO, type: "PARENT_OF" as const }

  it("accepts a valid relation", () => {
    expect(addRelationSchema.safeParse(base).success).toBe(true)
  })

  it("rejects a subtype that isn't valid for the type", () => {
    const r = addRelationSchema.safeParse({ ...base, subtype: "divorced" })
    expect(r.success).toBe(false)
  })

  it("rejects an end date before the start date", () => {
    const r = addRelationSchema.safeParse({
      ...base, type: "SPOUSE", startDate: "2020-06-01", endDate: "2019-01-01",
    })
    expect(r.success).toBe(false)
  })

  it("accepts an end date on or after the start date", () => {
    const r = addRelationSchema.safeParse({
      ...base, type: "SPOUSE", startDate: "2019-01-01", endDate: "2020-06-01",
    })
    expect(r.success).toBe(true)
  })

  it("rejects a syntactically-shaped but calendrically invalid date", () => {
    const r = addRelationSchema.safeParse({ ...base, startDate: "2024-13-45" })
    expect(r.success).toBe(false)
  })
})

describe("getAddGhostRelativeSchema", () => {
  const base = { firstName: "Jane", lastName: "Doe", anchorId: ANCHOR, kind: "parent" as const }

  it("accepts a valid ghost", () => {
    expect(addGhostSchema.safeParse(base).success).toBe(true)
  })

  it("accepts a migrated Azure portrait and rejects an off-site portrait", () => {
    const azureBase =
      process.env.MEDIA_PUBLIC_BASE_URL ||
      "https://stgenmediaexample.blob.core.windows.net/media"
    expect(addGhostSchema.safeParse({
      ...base,
      avatarUrl: `${azureBase}/profiles/p/avatar.jpg`,
    }).success).toBe(true)
    expect(addGhostSchema.safeParse({
      ...base,
      avatarUrl: "https://example.com/avatar.jpg",
    }).success).toBe(false)
  })

  it("rejects a death date before the birth date", () => {
    const r = addGhostSchema.safeParse({ ...base, birthDate: "1990-01-01", deathDate: "1980-01-01" })
    expect(r.success).toBe(false)
  })

  it("accepts a death date on or after the birth date", () => {
    const r = addGhostSchema.safeParse({ ...base, birthDate: "1990-01-01", deathDate: "2020-01-01" })
    expect(r.success).toBe(true)
  })

  it("accepts a same-day birth and death (stillbirth/neonatal death)", () => {
    const r = addGhostSchema.safeParse({ ...base, birthDate: "1990-01-01", deathDate: "1990-01-01" })
    expect(r.success).toBe(true)
  })

  it("rejects an end date before the start date (relation dates)", () => {
    const r = addGhostSchema.safeParse({
      ...base, kind: "spouse", startDate: "2020-06-01", endDate: "2019-01-01",
    })
    expect(r.success).toBe(false)
  })

  it("rejects a subtype that isn't valid for the kind", () => {
    const r = addGhostSchema.safeParse({ ...base, subtype: "divorced" })
    expect(r.success).toBe(false)
  })

  it("accepts removing a portrait", () => {
    expect(updateMemberSchema.safeParse({ ...base, avatarUrl: null }).success).toBe(true)
  })
})

describe("getUpdateMemberSchema", () => {
  const base = { firstName: "Jane", lastName: "Doe" }

  it("accepts valid identity fields", () => {
    expect(updateMemberSchema.safeParse(base).success).toBe(true)
  })

  it("rejects a death date before the birth date", () => {
    const r = updateMemberSchema.safeParse({ ...base, birthDate: "1990-01-01", deathDate: "1980-01-01" })
    expect(r.success).toBe(false)
  })
})

describe("getUpdateRelationSchema", () => {
  it("rejects an end date before the start date", () => {
    const r = updateRelationSchema.safeParse({ startDate: "2020-06-01", endDate: "2019-01-01" })
    expect(r.success).toBe(false)
  })

  it("accepts no dates at all", () => {
    expect(updateRelationSchema.safeParse({}).success).toBe(true)
  })
})
