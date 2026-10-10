const { randomUUID, createHash } = require('node:crypto')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Client } = require('pg')
const { repairPremiumTestExpiry } = require('../repair-premium-test-expiry.cjs')

const url = process.env.CONSUMER_ACCESS_TEST_DATABASE_URL

test('Premium test-expiry repair on disposable PostgreSQL', { skip: !url }, async (t) => {
  const target = new URL(url)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
  assert.match(target.pathname, /^\/genealogiq_coupon_qa_[a-z0-9_]+$/)
  const db = new Client({ connectionString: url })
  await db.connect()
  t.after(() => db.end())
  const premium = (await db.query("SELECT id FROM subscriptions WHERE code = 'PREMIUM'")).rows[0].id
  const tenant = (await db.query('SELECT id FROM tenants LIMIT 1')).rows[0].id

  async function fixture({ tenantId = null, value = 0, unrelated = false, createdAt = '2026-09-22 15:24:28.674', gift = false, paid = false } = {}) {
    const userId = `qa-expiry-${randomUUID()}`
    const testId = `test-premium-${createHash('md5').update(userId).digest('hex')}${unrelated ? '-unrelated' : ''}`
    await db.query(`INSERT INTO app_users (id, first_name, last_name, email, role, tenant_id, updated_at)
      VALUES ($1, 'Expiry', 'Fixture', $2, 'APP_USER', $3, CURRENT_TIMESTAMP)`, [userId, `${userId}@genealogiq.test`, tenantId])
    await db.query(`INSERT INTO app_sales (id, app_user_id, subscription_id, value, status, cadence, currency, created_at, updated_at, current_period_end)
      VALUES ($1, $2, $3, $4, 'active', 'annual', 'BRL', $5, $5, TIMESTAMP '2099-12-31 23:59:59')`, [testId, userId, premium, value, createdAt])
    const giftId = `qa-gift-${randomUUID()}`
    const grantId = `qa-grant-${randomUUID()}`
    const paidId = `qa-paid-${randomUUID()}`
    if (paid) {
      await db.query(`INSERT INTO app_sales (id, app_user_id, subscription_id, value, status, created_at, updated_at, current_period_end)
        VALUES ($1, $2, $3, 150, 'active', TIMESTAMP '2026-09-01 12:00:00', CURRENT_TIMESTAMP, TIMESTAMP '2027-03-31 12:00:00')`, [paidId, userId, premium])
    }
    if (gift) {
      await db.query(`INSERT INTO app_sales (id, app_user_id, subscription_id, value, status, cancel_at_period_end, created_at, updated_at, current_period_end)
        VALUES ($1, $2, $3, 0, 'active', true, TIMESTAMP '2026-10-08 02:13:01.075', CURRENT_TIMESTAMP, TIMESTAMP '2100-12-31 23:59:59')`, [giftId, userId, premium])
      await db.query(`INSERT INTO consumer_access_grants (id, request_id, request_hash, recipient_id, result_id, app_user_id, app_sale_id, created_by_id, starts_at, expires_at, created_at)
        VALUES ($1, $2, 'fixture', $3, $4, $3, $4, 'qa-operator', TIMESTAMP '2099-12-31 23:59:59', TIMESTAMP '2100-12-31 23:59:59', TIMESTAMP '2026-10-08 02:13:01.075')`, [grantId, randomUUID(), userId, giftId])
    }
    return { userId, testId, giftId, grantId, paidId }
  }
  const expiry = async (id) => (await db.query('SELECT current_period_end::text AS expiry FROM app_sales WHERE id = $1', [id])).rows[0].expiry

  await t.test('preview changes nothing; apply corrects 2099/2100, preserves real paid days and excludes partner/paid/lookalike rows', async () => {
    const legacy = await fixture()
    const badGift = await fixture({ gift: true })
    const paidGift = await fixture({ gift: true, paid: true })
    const partner = await fixture({ tenantId: tenant })
    const realPaid = await fixture({ value: 100 })
    const lookalike = await fixture({ unrelated: true })
    const preview = await repairPremiumTestExpiry(db)
    assert.equal(await expiry(badGift.giftId), '2100-12-31 23:59:59')
    assert.equal(preview.repairs.find((row) => row.id === legacy.testId).after.current_period_end, '2027-09-22T15:24:28.674')
    assert.equal(preview.repairs.find((row) => row.id === badGift.giftId).after.current_period_end, '2027-10-08T02:13:01.075')
    assert.equal(preview.repairs.find((row) => row.id === paidGift.giftId).after.current_period_end, '2028-03-31T12:00:00')
    for (const id of [partner.testId, realPaid.testId, lookalike.testId, paidGift.paidId]) {
      assert.ok(!preview.repairs.some((row) => row.id === id))
    }
    const applied = await repairPremiumTestExpiry(db, { apply: true, expectedSha256: preview.planSha256 })
    assert.deepEqual(applied.repairs, preview.repairs)
    assert.equal(await expiry(legacy.testId), '2027-09-22 15:24:28.674')
    assert.equal(await expiry(badGift.giftId), '2027-10-08 02:13:01.075')
    assert.equal(await expiry(paidGift.giftId), '2028-03-31 12:00:00')
    assert.equal(await expiry(paidGift.paidId), '2027-03-31 12:00:00')
    assert.equal((await db.query('SELECT status FROM app_sales WHERE id = $1', [legacy.testId])).rows[0].status, 'active')
    for (const id of [badGift.testId, paidGift.testId]) {
      assert.equal((await db.query('SELECT status FROM app_sales WHERE id = $1', [id])).rows[0].status, 'canceled')
    }
    // A later revocation of only the named gift must not resurrect the test allowance.
    await db.query("UPDATE app_sales SET status = 'canceled' WHERE id = $1", [badGift.giftId])
    assert.equal((await db.query("SELECT count(*)::int AS count FROM app_sales WHERE app_user_id = $1 AND status IN ('active', 'trialing')", [badGift.userId])).rows[0].count, 0)
    assert.equal((await db.query('SELECT starts_at::text, expires_at::text FROM consumer_access_grants WHERE id = $1', [badGift.grantId])).rows[0].starts_at, '2026-10-08 02:13:01.075')
    for (const row of [partner, realPaid, lookalike]) assert.equal(await expiry(row.testId), '2099-12-31 23:59:59')
    assert.equal((await repairPremiumTestExpiry(db)).repairs.length, 0)
  })

  await t.test('rejects a stale preview atomically', async () => {
    const first = await fixture()
    const changed = await fixture()
    const preview = await repairPremiumTestExpiry(db)
    await db.query('UPDATE app_sales SET value = 100 WHERE id = $1', [changed.testId])
    await assert.rejects(repairPremiumTestExpiry(db, { apply: true, expectedSha256: preview.planSha256 }), /stale/)
    assert.equal(await expiry(first.testId), '2099-12-31 23:59:59')
  })

  await t.test('rolls back every sale if the matching grant update fails, then succeeds on retry', async () => {
    const badGift = await fixture({ gift: true })
    const preview = await repairPremiumTestExpiry(db)
    // The ID is generated above from a fixed prefix plus randomUUID, not input.
    await db.query(`ALTER TABLE consumer_access_grants ADD CONSTRAINT qa_expiry_repair_failure
      CHECK (id <> '${badGift.grantId}' OR expires_at = TIMESTAMP '2100-12-31 23:59:59')`)
    try {
      await assert.rejects(repairPremiumTestExpiry(db, { apply: true, expectedSha256: preview.planSha256 }), /qa_expiry_repair_failure/)
      assert.equal(await expiry(badGift.testId), '2099-12-31 23:59:59')
      assert.equal(await expiry(badGift.giftId), '2100-12-31 23:59:59')
      assert.equal((await db.query('SELECT status FROM app_sales WHERE id = $1', [badGift.testId])).rows[0].status, 'active')
    } finally { await db.query('ALTER TABLE consumer_access_grants DROP CONSTRAINT qa_expiry_repair_failure') }
    await repairPremiumTestExpiry(db, { apply: true, expectedSha256: preview.planSha256 })
    assert.equal(await expiry(badGift.giftId), '2027-10-08 02:13:01.075')
  })

  await t.test('clamps a leap-day original grant to February 28 and requires a reviewed hash', async () => {
    const leap = await fixture({ createdAt: '2028-02-29 10:30:00' })
    await assert.rejects(repairPremiumTestExpiry(db, { apply: true }), /SHA-256/)
    const preview = await repairPremiumTestExpiry(db)
    assert.equal(preview.repairs.find((row) => row.id === leap.testId).after.current_period_end, '2029-02-28T10:30:00')
  })
})
