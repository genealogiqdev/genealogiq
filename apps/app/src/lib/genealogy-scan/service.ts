import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import type { GenealogyScan, Prisma } from "@genealogiq/db"
import { prisma } from "@/lib/prisma"
import { getMemorialFeatures } from "@/lib/subscription"
import { parseGraph, type ScanGraph } from "./graph"
import { buildScanDescription, SCAN_RUBRIC, type StartScanInput } from "./request"

/**
 * Genealogy Scan: an Anthropic Managed Agents session researches a surname on
 * the web and writes a graph file; this module starts the session and, each
 * time a client asks for the scan, pulls the latest file into the database.
 * Nothing here holds a connection open, so it runs inside ordinary serverless
 * request limits. See apps/app/docs/GENEALOGY-SCAN.md.
 */

export const SCAN_POLICY = {
  /** Scans a Premium account may start per calendar month (UTC). */
  monthlyLimit: 5,
  /** Hard spend ceiling per scan at Anthropic list prices, in US cents. */
  budgetCents: 400,
  /** Grade → revise cycles before the agent stops. */
  maxIterations: 2,
  /** Minimum gap between two pulls of the same running scan. */
  minSyncIntervalMs: 5_000,
} as const

export type ScanDenial = "notConfigured" | "premiumRequired" | "monthlyLimitReached" | "scanInProgress"

interface ScanConfig {
  apiKey: string
  agentId: string
  environmentId: string
}

function config(): ScanConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const agentId = process.env.GENEALOGY_SCAN_AGENT_ID
  const environmentId = process.env.GENEALOGY_SCAN_ENVIRONMENT_ID
  return apiKey && agentId && environmentId ? { apiKey, agentId, environmentId } : null
}

export const isScanConfigured = (): boolean => config() !== null

let cached: { key: string; client: Anthropic } | null = null
function clientFor(settings: ScanConfig): Anthropic {
  if (!cached || cached.key !== settings.apiKey) {
    cached = { key: settings.apiKey, client: new Anthropic({ apiKey: settings.apiKey }) }
  }
  return cached.client
}

export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export interface ScanAccess {
  configured: boolean
  premium: boolean
  usedThisMonth: number
  monthlyLimit: number
  running: boolean
  canStart: boolean
  denial: ScanDenial | null
}

/** Pure decision, separated from its lookups so the rule order is testable. */
export function decideScanAccess(facts: { configured: boolean; premium: boolean; usedThisMonth: number; running: boolean }): ScanAccess {
  const denial: ScanDenial | null = !facts.configured
    ? "notConfigured"
    : !facts.premium
      ? "premiumRequired"
      : facts.running
        ? "scanInProgress"
        : facts.usedThisMonth >= SCAN_POLICY.monthlyLimit
          ? "monthlyLimitReached"
          : null
  return { ...facts, monthlyLimit: SCAN_POLICY.monthlyLimit, canStart: denial === null, denial }
}

export async function getScanAccess(userId: string): Promise<ScanAccess> {
  const [features, usedThisMonth, running] = await Promise.all([
    getMemorialFeatures(userId),
    // Failed scans do not use up the allowance: the user got nothing for them.
    prisma.genealogyScan.count({
      where: { appUserId: userId, createdAt: { gte: startOfMonthUtc() }, status: { not: "FAILED" } },
    }),
    prisma.genealogyScan.count({ where: { appUserId: userId, status: "RUNNING" } }),
  ])
  return decideScanAccess({
    configured: isScanConfigured(),
    premium: features.code === "PREMIUM",
    usedThisMonth,
    running: running > 0,
  })
}

export type StartScanResult =
  | { ok: true; scan: GenealogyScan }
  | { ok: false; denial: ScanDenial | "unavailable" }

export async function startScan(userId: string, input: StartScanInput, locale: string): Promise<StartScanResult> {
  // A retried request returns the scan it already started instead of billing a second one.
  const existing = await prisma.genealogyScan.findUnique({ where: { requestId: input.requestId } })
  if (existing) {
    return existing.appUserId === userId ? { ok: true, scan: existing } : { ok: false, denial: "unavailable" }
  }

  const access = await getScanAccess(userId)
  if (!access.canStart) return { ok: false, denial: access.denial ?? "unavailable" }
  const settings = config()
  if (!settings) return { ok: false, denial: "notConfigured" }

  let sessionId: string
  try {
    const session = await clientFor(settings).beta.sessions.create({
      agent: settings.agentId,
      environment_id: settings.environmentId,
      title: `Genealogy scan: ${input.surname}`,
      // The platform stops issuing model requests once this is reached.
      budget: { type: "limit", max_list_cost: { amount: String(SCAN_POLICY.budgetCents), currency: "USD" } },
      initial_events: [
        {
          type: "user.define_outcome",
          description: buildScanDescription(input, locale),
          rubric: { type: "text", content: SCAN_RUBRIC },
          max_iterations: SCAN_POLICY.maxIterations,
        },
      ],
    })
    sessionId = session.id
  } catch (error) {
    console.error("[genealogy-scan] could not start session", error instanceof Anthropic.APIError ? error.status : error)
    return { ok: false, denial: "unavailable" }
  }

  const scan = await prisma.genealogyScan.create({
    data: {
      appUserId: userId,
      requestId: input.requestId,
      surname: input.surname,
      anchors: { anchors: input.anchors, notes: input.notes } as Prisma.InputJsonValue,
      locale,
      status: "RUNNING",
      sessionId,
    },
  })
  return { ok: true, scan }
}

async function readGraphFile(client: Anthropic, sessionId: string): Promise<ScanGraph | null> {
  for await (const file of client.beta.files.list({ scope_id: sessionId, betas: ["managed-agents-2026-04-01"] })) {
    if (file.filename !== "graph.json" && !file.filename.endsWith("/graph.json")) continue
    const response = await client.beta.files.download(file.id)
    try {
      return parseGraph(JSON.parse(await response.text()))
    } catch {
      // The agent rewrites the file as it works; a half-written version is skipped until the next pull.
      return null
    }
  }
  return null
}

function costCents(amount: string | null | undefined): number | null {
  if (!amount) return null
  const value = Number(amount)
  return Number.isFinite(value) ? Math.round(value) : null
}

/**
 * Bring a running scan up to date with its session: store the newest valid
 * graph and, once the session has stopped, settle the scan as COMPLETED (a
 * graph exists) or FAILED (it produced nothing). A transient API error leaves
 * the scan as it was; the next request tries again.
 */
export async function syncScan(scan: GenealogyScan): Promise<GenealogyScan> {
  if (scan.status !== "RUNNING" || !scan.sessionId) return scan
  if (scan.lastSyncedAt && Date.now() - scan.lastSyncedAt.getTime() < SCAN_POLICY.minSyncIntervalMs) return scan
  const settings = config()
  if (!settings) return scan

  const client = clientFor(settings)
  try {
    const session = await client.beta.sessions.retrieve(scan.sessionId)
    const graph = await readGraphFile(client, scan.sessionId)
    const stopped = session.status === "idle" || session.status === "terminated"
    // The newest file is kept only when it parsed; otherwise the previous graph stands.
    const hasGraph = graph !== null || scan.graph !== null

    return await prisma.genealogyScan.update({
      where: { id: scan.id },
      data: {
        lastSyncedAt: new Date(),
        ...(graph ? { graph: graph as unknown as Prisma.InputJsonValue, nodeCount: graph.nodes.length, edgeCount: graph.edges.length } : {}),
        ...(stopped
          ? {
              status: hasGraph ? "COMPLETED" : "FAILED",
              failureCode: hasGraph ? null : "noResult",
              completedAt: new Date(),
              listCostCents: costCents(session.usage?.list_cost?.amount),
            }
          : {}),
      },
    })
  } catch (error) {
    if (error instanceof Anthropic.NotFoundError) {
      return prisma.genealogyScan.update({
        where: { id: scan.id },
        data: {
          status: scan.graph ? "COMPLETED" : "FAILED",
          failureCode: scan.graph ? null : "sessionGone",
          completedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      })
    }
    console.error("[genealogy-scan] sync failed", error instanceof Anthropic.APIError ? error.status : error)
    return scan
  }
}

/** Ask a still-running session to stop. Best effort: the scan row is removed either way. */
export async function interruptScan(scan: GenealogyScan): Promise<void> {
  const settings = config()
  if (!settings || scan.status !== "RUNNING" || !scan.sessionId) return
  try {
    await clientFor(settings).beta.sessions.events.send(scan.sessionId, { events: [{ type: "user.interrupt" }] })
  } catch (error) {
    console.error("[genealogy-scan] interrupt failed", error instanceof Anthropic.APIError ? error.status : error)
  }
}
