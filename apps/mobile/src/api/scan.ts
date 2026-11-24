import { action, view } from './client'

/** Genealogy Scan contract (server: apps/app/src/mobile/views/scan.ts, apps/app/src/actions/genealogy-scan.actions.ts). */

export type ScanNodeType = 'surname' | 'variant' | 'person' | 'family' | 'place' | 'event'
export type ScanConfidence = 'documented' | 'probable' | 'speculative'
export type ScanRelation =
  | 'parent_of'
  | 'spouse_of'
  | 'sibling_of'
  | 'variant_of'
  | 'originated_in'
  | 'lived_in'
  | 'migrated_to'
  | 'member_of'
  | 'participated_in'
  | 'related_to'

export interface ScanSource {
  id: string
  title: string
  /** Always an http(s) URL; validated on the server. */
  url: string
}

export interface ScanNode {
  id: string
  type: ScanNodeType
  label: string
  /** Markdown, at most ~800 characters. */
  summary: string
  /** A node with no source is always `speculative`. */
  confidence: ScanConfidence
  years: string
  /** Ids into `ScanGraph.sources`. */
  sources: string[]
}

export interface ScanEdge {
  from: string
  to: string
  relation: ScanRelation
  label: string
}

export interface ScanGraph {
  version: 1
  surname: string
  /** Markdown overview of what was established and what remains open. */
  summary: string
  nodes: ScanNode[]
  edges: ScanEdge[]
  sources: ScanSource[]
}

export type ScanStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'
export type ScanDenial = 'notConfigured' | 'premiumRequired' | 'monthlyLimitReached' | 'scanInProgress'

export interface ScanAccess {
  configured: boolean
  premium: boolean
  usedThisMonth: number
  monthlyLimit: number
  running: boolean
  canStart: boolean
  /** Why a scan cannot be started now; null when `canStart`. */
  denial: ScanDenial | null
}

export interface ScanSummary {
  id: string
  surname: string
  status: ScanStatus
  failureCode: string | null
  nodeCount: number
  edgeCount: number
  createdAt: string
  completedAt: string | null
}

export type AnchorRelation = 'self' | 'parent' | 'grandparent' | 'great_grandparent' | 'other'

export interface ScanAnchor {
  relation: AnchorRelation
  /** 2–120 characters, letters with spaces, apostrophes, dots and hyphens. */
  name: string
  place?: string
  /** Approximate year (birth or other), 1000–current year. */
  year?: number | null
}

export interface StartScanInput {
  /** UUID generated once per attempt: a retried request returns the same scan. */
  requestId: string
  /** 2–60 characters, letters with spaces, apostrophes, dots and hyphens. */
  surname: string
  /** Up to 8. */
  anchors?: ScanAnchor[]
  /** Up to 500 characters. */
  notes?: string
}

export interface ScanDetail extends ScanSummary {
  anchors: { anchors: ScanAnchor[]; notes: string } | null
  /** Null until the first results arrive. Grows while `status` is RUNNING. */
  graph: ScanGraph | null
}

export const scanApi = {
  /** My scans, newest first, and whether I may start another. */
  list: () => view<{ access: ScanAccess; scans: ScanSummary[] }>('app', 'genealogyScans'),
  /**
   * One scan with its graph. Poll this (every ~6 s) while `status` is RUNNING:
   * each read pulls the latest results from the research session.
   */
  detail: (id: string) => view<ScanDetail>('app', 'genealogyScan', { id }),
  /** Premium only, limited per month. Failure messages are already localised. */
  start: (input: StartScanInput) => action<{ id: string }>('app', 'startGenealogyScan', { args: [input] }),
  /** Stops a running scan and removes it. */
  remove: (id: string) => action('app', 'deleteGenealogyScan', { args: [id] }),
  registerDevicePushToken: (token: string, platform: 'ios' | 'android') =>
    action('app', 'registerDevicePushToken', { args: [{ token, platform }] }),
  unregisterDevicePushToken: (token: string) => action('app', 'unregisterDevicePushToken', { args: [{ token }] }),
}
