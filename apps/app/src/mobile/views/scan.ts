import "server-only"

import { notFound } from "next/navigation"
import type { MobileView } from "@genealogiq/auth/mobile"
import type { GenealogyScan } from "@genealogiq/db"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { getScanAccess, syncScan } from "@/lib/genealogy-scan/service"
import { requireParam } from "./shared"

function summary(scan: GenealogyScan) {
  return {
    id: scan.id,
    surname: scan.surname,
    status: scan.status,
    failureCode: scan.failureCode,
    nodeCount: scan.nodeCount,
    edgeCount: scan.edgeCount,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
  }
}

/** The signed-in user's scans (newest first) and whether they may start another. */
export const genealogyScans: MobileView = async () => {
  const session = await verifySession()
  const [access, scans] = await Promise.all([
    getScanAccess(session.user.id),
    prisma.genealogyScan.findMany({
      where: { appUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])
  return { access, scans: scans.map(summary) }
}

/**
 * One scan with its graph. While the scan is running, each read pulls the
 * newest graph from the research session (throttled), so polling this view is
 * what moves a scan forward.
 */
export const genealogyScan: MobileView = async (params) => {
  const session = await verifySession()
  const id = requireParam(params, "id")
  // Owner-scoped lookup: someone else's scan is a 404, never a 403 that confirms it exists.
  const found = await prisma.genealogyScan.findFirst({ where: { id, appUserId: session.user.id } })
  if (!found) notFound()

  const scan = await syncScan(found)
  return { ...summary(scan), anchors: scan.anchors, graph: scan.graph }
}
