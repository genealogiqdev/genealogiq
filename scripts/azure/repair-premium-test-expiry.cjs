// Correct only the independent-consumer test rows created by migration
// 20260922010000 and the BMS gifts that inherited its exact 2099 sentinel.
// Preview is read-only. Apply requires the hash of a reviewed preview; every
// before/after value is returned as a repair receipt without customer PII.
const { createHash } = require('node:crypto')

const legacyScope = `s.id = 'test-premium-' || md5(s.app_user_id)
  AND u.role = 'APP_USER' AND u.tenant_id IS NULL AND s.tenant_id IS NULL
  AND p.code = 'PREMIUM' AND s.value = 0 AND s.sold_by_id IS NULL
  AND s.stripe_subscription_id IS NULL AND s.stripe_price_id IS NULL
  AND s.status IN ('active', 'trialing')
  AND s.current_period_end = TIMESTAMP '2099-12-31 23:59:59'
  AND NOT EXISTS (SELECT 1 FROM coupon_redemptions c WHERE c.app_sale_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM consumer_access_grants g WHERE g.app_sale_id = s.id)`

async function readPlan(db) {
  // JSON timestamps are serialized by PostgreSQL, not a workstation timezone.
  const legacy = (await db.query(`SELECT s.id, s.app_user_id,
    jsonb_build_object('current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end, 'status', s.status) AS before,
    jsonb_build_object('current_period_end', s.created_at + INTERVAL '12 months',
      'cancel_at_period_end', true, 'status', s.status) AS after
    FROM app_sales s JOIN app_users u ON u.id = s.app_user_id
    JOIN subscriptions p ON p.id = s.subscription_id
    WHERE ${legacyScope} ORDER BY s.id`)).rows
  const grants = (await db.query(`SELECT g.id, g.app_sale_id, s.id AS legacy_sale_id,
    jsonb_build_object('starts_at', g.starts_at, 'expires_at', g.expires_at) AS before,
    jsonb_build_object('starts_at', corrected.starts_at,
      'expires_at', corrected.starts_at + INTERVAL '12 months') AS after,
    jsonb_build_object('current_period_end', gift.current_period_end) AS sale_before,
    jsonb_build_object('current_period_end', corrected.starts_at + INTERVAL '12 months') AS sale_after
    FROM consumer_access_grants g
    JOIN app_sales gift ON gift.id = g.app_sale_id AND gift.id = g.result_id
    JOIN app_sales s ON s.app_user_id = g.recipient_id
    JOIN app_users u ON u.id = s.app_user_id AND u.id = g.app_user_id
    JOIN subscriptions p ON p.id = s.subscription_id
    CROSS JOIN LATERAL (SELECT GREATEST(g.created_at, (
      SELECT max(paid.current_period_end) FROM app_sales paid
      WHERE paid.app_user_id = g.recipient_id AND paid.id NOT IN (s.id, gift.id)
        AND paid.subscription_id = gift.subscription_id AND paid.stripe_subscription_id IS NULL
        AND paid.status IN ('active', 'trialing') AND paid.created_at <= g.created_at
        AND paid.current_period_end > g.created_at
    )) AS starts_at) corrected
    WHERE ${legacyScope}
      AND g.starts_at = TIMESTAMP '2099-12-31 23:59:59'
      AND g.expires_at = TIMESTAMP '2100-12-31 23:59:59'
      AND gift.current_period_end = g.expires_at
      AND gift.app_user_id = u.id AND gift.subscription_id = s.subscription_id
      AND gift.tenant_id IS NULL AND gift.value = 0
      AND gift.stripe_subscription_id IS NULL AND gift.stripe_price_id IS NULL
      AND gift.status IN ('active', 'trialing')
    ORDER BY g.id`)).rows

  const repairs = legacy.map(({ id, before, after }) => ({ table: 'app_sales', id, before, after }))
  for (const row of grants) {
    // A gift replaces its migration-only test allowance. Leaving that allowance
    // active would silently restore Premium if the named gift is later revoked.
    repairs.find((repair) => repair.id === row.legacy_sale_id).after.status = 'canceled'
    repairs.push({ table: 'app_sales', id: row.app_sale_id, before: row.sale_before, after: row.sale_after })
    repairs.push({ table: 'consumer_access_grants', id: row.id, before: row.before, after: row.after })
  }
  repairs.sort((a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id))
  return { version: 2, legacySales: legacy.length, consumerGifts: grants.length, repairs }
}

async function repairPremiumTestExpiry(db, { apply = false, expectedSha256 } = {}) {
  if (apply && !/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) {
    throw new Error('Apply requires the SHA-256 from a reviewed read-only preview.')
  }
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE' + (apply ? '' : ' READ ONLY'))
  try {
    await db.query("SET LOCAL statement_timeout = '20s'")
    await db.query("SET LOCAL lock_timeout = '5s'")
    if (apply) {
      // Coordinate with the consumer/coupon writers without locking other users.
      await db.query(`SELECT u.id FROM app_sales s JOIN app_users u ON u.id = s.app_user_id
        JOIN subscriptions p ON p.id = s.subscription_id WHERE ${legacyScope}
        ORDER BY u.id FOR UPDATE OF u`)
    }
    const plan = await readPlan(db)
    const planSha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
    if (apply && expectedSha256 !== planSha256) throw new Error('Preview is stale; no rows were changed. Review a fresh preview.')
    if (apply) {
      for (const { table, id, before, after } of plan.repairs) {
        // Identifiers come only from readPlan's closed set, never external input.
        const columns = Object.keys(after)
        const values = columns.map((column) => after[column])
        const beforeValues = columns.map((column) => before[column])
        const assignments = columns.map((column, i) => `"${column}" = $${i + 1}`)
        const guards = columns.map((column, i) => `"${column}" IS NOT DISTINCT FROM $${columns.length + i + 2}`)
        const updatedAt = table === 'app_sales' ? ', updated_at = CURRENT_TIMESTAMP' : ''
        const result = await db.query(`UPDATE "${table}" SET ${assignments.join(', ')}${updatedAt}
          WHERE id = $${columns.length + 1} AND ${guards.join(' AND ')}`,
        [...values, id, ...beforeValues])
        if (result.rowCount !== 1) throw new Error('A repair target changed; the entire repair was rolled back.')
      }
      // All candidates must now be gone, including the formerly dominant 2099 sale.
      if ((await readPlan(db)).repairs.length) throw new Error('Post-repair verification failed.')
    }
    await db.query(apply ? 'COMMIT' : 'ROLLBACK')
    return { action: apply ? 'applied-premium-expiry-repair' : 'read-only-premium-expiry-preview', planSha256, ...plan }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    throw error
  }
}

module.exports = { repairPremiumTestExpiry }

if (require.main === module || process.env.REPAIR_EXECUTE === 'true') {
  void (async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    const { Client } = require('pg')
    const db = new Client({ connectionString: process.env.DATABASE_URL })
    try {
      await db.connect()
      const result = await repairPremiumTestExpiry(db, {
        apply: process.env.REPAIR_APPLY === 'true', expectedSha256: process.env.REPAIR_EXPECTED_SHA256,
      })
      const { repairs, ...summary } = result
      console.log(JSON.stringify({ ...summary, changedRows: repairs.length }))
      for (const repair of repairs) console.log(JSON.stringify({ action: 'premium-expiry-repair-row', ...repair }))
    } finally { await db.end() }
  })().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
