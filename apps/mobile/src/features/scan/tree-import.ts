// Pure helpers for "Add to my tree": turn a scan note's label and `years`
// into the fields of the family-tree form. Everything is a suggestion the user
// reviews before anything is saved.

export interface PersonName {
  firstName: string
  lastName: string
}

/** Words that belong to the family name that follows them ("da Silva", "van der Berg", "de la Cruz"). */
const PARTICLES = new Set(['da', 'das', 'de', 'del', 'della', 'der', 'di', 'do', 'dos', 'du', 'la', 'las', 'le', 'los', 'van', 'von'])
const NAME_MAX = 64

/**
 * Split a label into given names and family name: the family name is the last
 * word plus any particles directly before it. Parenthesised or bracketed notes
 * and anything after a comma are ignored. A single word is a given name only.
 */
export function splitPersonLabel(label: string): PersonName {
  const cleaned = label
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned ? cleaned.split(' ') : []
  if (words.length === 0) return { firstName: '', lastName: '' }
  if (words.length === 1) return { firstName: words[0].slice(0, NAME_MAX), lastName: '' }
  let start = words.length - 1
  while (start > 1 && PARTICLES.has(words[start - 1].toLowerCase())) start--
  return {
    firstName: words.slice(0, start).join(' ').slice(0, NAME_MAX).trim(),
    lastName: words.slice(start).join(' ').slice(0, NAME_MAX).trim(),
  }
}

export interface ParsedYears {
  birthYear: number | null
  deathYear: number | null
  /** The text marks at least one year as approximate ("c.", "ca.", "circa", "~", "?"). */
  approximate: boolean
}

const inRange = (year: number, currentYear: number) => year >= 1000 && year <= currentYear

/**
 * Read a life span such as `1820–1890`, `c. 1750`, `1820–` or `d. 1890`.
 * A single year is a birth year unless it is marked as a death ("d.", "†",
 * "–1890"). Years outside 1000–current year, or a death before the birth,
 * are dropped rather than guessed.
 */
export function parseYears(text: string, currentYear: number = new Date().getFullYear()): ParsedYears {
  const empty: ParsedYears = { birthYear: null, deathYear: null, approximate: false }
  const source = text.trim()
  if (!source) return empty
  const found = [...source.matchAll(/\b\d{4}\b/g)].map((match) => ({ year: Number(match[0]), index: match.index ?? 0 }))
  if (found.length === 0) return empty
  const approximate = /\bc\.|\bca\.?(?=\s|\d)|\bcirca\b|~|\?/i.test(source)

  let birthYear: number | null = null
  let deathYear: number | null = null
  if (found.length >= 2) {
    birthYear = found[0].year
    deathYear = found[1].year
  } else {
    const before = source.slice(0, found[0].index)
    const isDeath = /[-–—]\s*(?:c\.|ca\.?|circa|~)?\s*$/i.test(before) || /(?:^|\s)(?:d\.|†|✝)\s*(?:c\.|ca\.?|circa|~)?\s*$/i.test(before)
    if (isDeath) deathYear = found[0].year
    else birthYear = found[0].year
  }
  if (birthYear !== null && !inRange(birthYear, currentYear)) birthYear = null
  if (deathYear !== null && !inRange(deathYear, currentYear)) deathYear = null
  if (birthYear !== null && deathYear !== null && deathYear < birthYear) deathYear = null
  return { birthYear, deathYear, approximate }
}

/** A typed year field: '' → null, a valid year → number, anything else → 'invalid'. */
export function readYearField(value: string, currentYear: number = new Date().getFullYear()): number | null | 'invalid' {
  const text = value.trim()
  if (!text) return null
  if (!/^\d{4}$/.test(text)) return 'invalid'
  const year = Number(text)
  return inRange(year, currentYear) ? year : 'invalid'
}

/**
 * The family tree stores full dates; a scan only knows the year, so it is sent
 * as 1 January of that year (the confirm text says so).
 */
export const yearToDate = (year: number | null): string | null => (year === null ? null : `${String(year).padStart(4, '0')}-01-01`)
