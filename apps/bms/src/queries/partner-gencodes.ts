import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifyConsumerAdmin } from '@/lib/consumer-access'

/** Operational units, with all partner rows (including zero stock); no inferred sales or money. */
export async function getPartnerGenCodeOverview(query = '') {
  await verifyConsumerAdmin()
  const search = query.trim().slice(0, 320)
  const rows = await prisma.$queryRaw<{
    tenantId: string; tenantName: string; available: bigint; sold: bigint; activated: bigint; pending: bigint; lastSaleAt: Date | null
  }[]>`
    SELECT t.id AS "tenantId", COALESCE(NULLIF(t.trade_name, ''), t.name) AS "tenantName",
      COUNT(g.id) FILTER (WHERE g.status = 'AVAILABLE') AS available,
      COUNT(g.id) FILTER (WHERE g.sold_at IS NOT NULL) AS sold,
      COUNT(g.id) FILTER (WHERE g.status = 'ACTIVATED') AS activated,
      COUNT(g.id) FILTER (WHERE g.status = 'SOLD') AS pending,
      MAX(g.sold_at) AS "lastSaleAt"
    FROM tenants t LEFT JOIN gencodes g ON g.tenant_id = t.id
    WHERE ${search} = '' OR t.name ILIKE '%' || ${search} || '%' OR t.trade_name ILIKE '%' || ${search} || '%'
    GROUP BY t.id, t.name, t.trade_name
    ORDER BY MAX(g.sold_at) DESC NULLS LAST, COALESCE(NULLIF(t.trade_name, ''), t.name), t.id
  `
  const partners = rows.map((row) => ({ ...row, available: Number(row.available), sold: Number(row.sold),
    activated: Number(row.activated), pending: Number(row.pending) }))
  const totals = partners.reduce((sum, row) => ({ available: sum.available + row.available, sold: sum.sold + row.sold,
    activated: sum.activated + row.activated, pending: sum.pending + row.pending }), { available: 0, sold: 0, activated: 0, pending: 0 })
  return { partners, totals, search }
}
