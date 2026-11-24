// Pure: the start-scan form. Mirrors the server's rules
// (apps/app/src/lib/genealogy-scan/request.ts) so a mistake is caught before
// the request is sent; the server validates again.
import type { AnchorRelation, ScanAnchor, StartScanInput } from '@/api/scan'

export const ANCHOR_RELATIONS: readonly AnchorRelation[] = ['self', 'parent', 'grandparent', 'great_grandparent', 'other']
export const MAX_ANCHORS = 8
export const SURNAME_MAX = 60
export const ANCHOR_TEXT_MAX = 120
export const NOTES_MAX = 500

/** A letter first, then letters, spaces, apostrophes, dots and hyphens. */
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u

export type FieldIssue = 'required' | 'tooShort' | 'tooLong' | 'invalidCharacters' | 'invalidYear'

function nameIssue(value: string, max: number): FieldIssue | null {
  const text = value.trim()
  if (!text) return 'required'
  if (text.length < 2) return 'tooShort'
  if (text.length > max) return 'tooLong'
  return NAME.test(text) ? null : 'invalidCharacters'
}

export const surnameIssue = (value: string): FieldIssue | null => nameIssue(value, SURNAME_MAX)

export interface AnchorDraft {
  /** Stable React key; never sent. */
  key: string
  relation: AnchorRelation
  name: string
  place: string
  year: string
}

export interface AnchorIssues {
  name?: FieldIssue
  place?: FieldIssue
  year?: FieldIssue
}

export interface ScanFormDraft {
  surname: string
  anchors: AnchorDraft[]
  notes: string
}

export interface ScanFormIssues {
  surname?: FieldIssue
  notes?: FieldIssue
  /** Keyed by `AnchorDraft.key`; only anchors with a problem appear. */
  anchors: Record<string, AnchorIssues>
}

const isBlank = (anchor: AnchorDraft) => !anchor.name.trim() && !anchor.place.trim() && !anchor.year.trim()

export type FormResult = { ok: true; value: Omit<StartScanInput, 'requestId'> } | { ok: false; issues: ScanFormIssues }

/** Validate the draft. An anchor row left completely empty is ignored, not an error. */
export function validateScanForm(draft: ScanFormDraft, currentYear: number = new Date().getFullYear()): FormResult {
  const issues: ScanFormIssues = { anchors: {} }
  const surname = surnameIssue(draft.surname)
  if (surname) issues.surname = surname
  if (draft.notes.trim().length > NOTES_MAX) issues.notes = 'tooLong'

  const anchors: ScanAnchor[] = []
  for (const anchor of draft.anchors.slice(0, MAX_ANCHORS)) {
    if (isBlank(anchor)) continue
    const found: AnchorIssues = {}
    const name = nameIssue(anchor.name, ANCHOR_TEXT_MAX)
    if (name) found.name = name
    if (anchor.place.trim().length > ANCHOR_TEXT_MAX) found.place = 'tooLong'
    let year: number | null = null
    const yearText = anchor.year.trim()
    if (yearText) {
      year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN
      if (!(year >= 1000 && year <= currentYear)) found.year = 'invalidYear'
    }
    if (found.name || found.place || found.year) {
      issues.anchors[anchor.key] = found
      continue
    }
    const place = anchor.place.trim()
    anchors.push({ relation: anchor.relation, name: anchor.name.trim(), ...(place ? { place } : {}), year })
  }

  if (issues.surname || issues.notes || Object.keys(issues.anchors).length > 0) return { ok: false, issues }
  const notes = draft.notes.trim()
  return { ok: true, value: { surname: draft.surname.trim(), anchors, ...(notes ? { notes } : {}) } }
}

const hex = (value: number, length: number) => value.toString(16).padStart(length, '0')

/**
 * A UUID v4 for `StartScanInput.requestId`. Uses the platform generator when
 * there is one, else builds an RFC 4122 version-4 value from random bytes.
 */
export function newRequestId(random: () => number = Math.random): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID
  if (native && random === Math.random) {
    try {
      return native.call((globalThis as { crypto?: unknown }).crypto)
    } catch {
      // Fall through to the manual construction.
    }
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256) & 0xff)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const text = bytes.map((byte) => hex(byte, 2)).join('')
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}
