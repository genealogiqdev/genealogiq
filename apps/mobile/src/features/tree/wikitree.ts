// Port of the web's lib/wikitree-mapper.ts plus the proxy response shapes.

export interface WikiTreeSearchResult {
  id: string
  firstName: string
  lastNameAtBirth: string
  lastNameCurrent: string
  birthDate: string | null
  deathDate: string | null
  birthLocation: string | null
  gender: string | null
}

export interface WikiTreeProfile extends WikiTreeSearchResult {
  deathLocation: string | null
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

export interface GhostPrefill {
  firstName: string
  lastName: string
  maidenName: string | null
  gender: Gender | null
  birthDate: string | null
  deathDate: string | null
  birthPlace: string | null
  deathPlace: string | null
  sourceUrl: string
}

const MAX_PLACE_LENGTH = 100

/** WikiTree uses "00" for an unknown month/day; a partial date becomes null, never a fabricated full date. */
export function normalizeWikiTreeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const [, year, month, day] = match
  return year === '0000' || month === '00' || day === '00' ? null : raw
}

export function wikiTreeYear(raw: string | null | undefined): number | null {
  if (!raw) return null
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(raw)
  return !match || match[1] === '0000' ? null : Number(match[1])
}

function place(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed.slice(0, MAX_PLACE_LENGTH) : null
}

export function wikiTreeToGhostPrefill(profile: WikiTreeProfile): GhostPrefill {
  const lastName = profile.lastNameCurrent || profile.lastNameAtBirth
  return {
    firstName: profile.firstName,
    lastName,
    maidenName: profile.lastNameAtBirth && profile.lastNameAtBirth !== lastName ? profile.lastNameAtBirth : null,
    gender: profile.gender === 'Male' ? 'MALE' : profile.gender === 'Female' ? 'FEMALE' : null,
    birthDate: normalizeWikiTreeDate(profile.birthDate),
    deathDate: normalizeWikiTreeDate(profile.deathDate),
    birthPlace: place(profile.birthLocation),
    deathPlace: place(profile.deathLocation),
    sourceUrl: `https://www.wikitree.com/wiki/${encodeURIComponent(profile.id)}`,
  }
}
