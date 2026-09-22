import { describe, it, expect } from "vitest"
import { identityTranslator } from "@genealogiq/core"
import { getPetSchema, getPetEditSchema } from "./pet.schema"

const createSchema = getPetSchema(identityTranslator)
const editSchema = getPetEditSchema(identityTranslator)

const base = {
  firstName: "Rex",
  species: "Dog",
  breed: "Golden Retriever",
  gender: "MALE",
  birthDate: "2020-01-01",
  deathDate: null,
  avatarUrl: null,
  ownerIds: ["clabc123456789012345678901"],
}

describe("getPetSchema (create)", () => {
  it("accepts a valid pet", () => {
    expect(createSchema.safeParse(base).success).toBe(true)
  })

  it("requires a name", () => {
    expect(createSchema.safeParse({ ...base, firstName: "" }).success).toBe(false)
  })

  it("rejects a name over 64 characters", () => {
    expect(createSchema.safeParse({ ...base, firstName: "a".repeat(65) }).success).toBe(false)
  })

  it("accepts optional species/breed/gender/dates as null", () => {
    expect(createSchema.safeParse({
      ...base, species: null, breed: null, gender: null, birthDate: null, deathDate: null,
    }).success).toBe(true)
  })

  it("rejects a death date before the birth date", () => {
    expect(createSchema.safeParse({
      ...base, birthDate: "2020-01-01", deathDate: "2019-01-01",
    }).success).toBe(false)
  })

  it("accepts a death date on or after the birth date", () => {
    expect(createSchema.safeParse({
      ...base, birthDate: "2020-01-01", deathDate: "2020-01-01",
    }).success).toBe(true)
  })

  it("requires at least one owner", () => {
    expect(createSchema.safeParse({ ...base, ownerIds: [] }).success).toBe(false)
  })

  it("rejects a malformed owner id", () => {
    expect(createSchema.safeParse({ ...base, ownerIds: ["not-a-cuid"] }).success).toBe(false)
  })
})

const editableBase = {
  firstName: base.firstName,
  species: base.species,
  breed: base.breed,
  gender: base.gender,
  birthDate: base.birthDate,
  deathDate: base.deathDate,
  avatarUrl: base.avatarUrl,
}

describe("getPetEditSchema (update)", () => {
  it("accepts a valid pet with at least one owner", () => {
    expect(editSchema.safeParse({ ...editableBase, ownerIds: base.ownerIds }).success).toBe(true)
  })

  it("requires a name", () => {
    expect(editSchema.safeParse({ ...editableBase, ownerIds: base.ownerIds, firstName: "" }).success).toBe(false)
  })

  it("rejects a death date before the birth date", () => {
    expect(editSchema.safeParse({
      ...editableBase,
      ownerIds: base.ownerIds,
      birthDate: "2020-01-01",
      deathDate: "2019-01-01",
    }).success).toBe(false)
  })
})
