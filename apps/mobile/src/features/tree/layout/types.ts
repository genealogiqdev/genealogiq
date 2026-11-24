// Structural input types of the layout port. The web layout receives Prisma
// `Date`s; the mobile API sends ISO strings, so every date is a `DateLike`
// and is read through `timeOf`. No React / DOM / server imports here.

export type DateLike = string | Date | null

/** Milliseconds since epoch, or null for a missing / unparsable date. */
export function timeOf(value: DateLike | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Only the fields the layout reads; the API's TreePerson satisfies it. */
export interface TreePerson {
  birthDate: DateLike
  birthYear: number | null
}

export interface TreeRelation {
  id: string
  type: string
  subtype: string | null
  fromId: string
  toId: string
  startDate: DateLike
  endDate: DateLike
  status: string
}

export interface TreePetOwnership {
  id: string
  petId: string
  ownerId: string
}
