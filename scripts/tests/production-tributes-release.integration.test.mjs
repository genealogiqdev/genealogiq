import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { verifyTributes } from '../production-tributes-release.mjs'
const { Client } = createRequire(import.meta.url)('pg')
const url = process.env.TRIBUTES_TEST_DATABASE_URL

test('exact SQL permits two messages, preserves the first and rolls back release fixtures', { skip: !url }, async () => {
  const target = new URL(url)
  assert.equal(target.hostname, '127.0.0.1')
  assert.match(target.pathname, /^\/genealogiq_coupon_qa_tributes_/)
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const counts = (await db.query('SELECT (SELECT count(*)::int FROM app_tributes) AS tributes, (SELECT count(*)::int FROM app_notifications) AS notifications')).rows[0]
    assert.equal(counts.tributes, 0, 'This disposable fixture starts without tributes')
    await db.query('DROP INDEX IF EXISTS tributes_app_author_profile_idx')
    await db.query('CREATE UNIQUE INDEX tributes_app_author_profile_key ON app_tributes(app_author_id, app_profile_id)')
    await assert.rejects(verifyTributes(db), /index mismatch/)
    await db.query('BEGIN')
    try {
      const user = (await db.query('SELECT id FROM app_users ORDER BY id LIMIT 1')).rows[0]
      await db.query("INSERT INTO app_tributes(id, text, app_author_id, app_profile_id) VALUES ('release-old-first', 'Old first memory', $1, $1)", [user.id])
      await assert.rejects(db.query("INSERT INTO app_tributes(id, text, app_author_id, app_profile_id) VALUES ('release-old-second', 'Old second memory', $1, $1)", [user.id]), { code: '23505' })
    } finally { await db.query('ROLLBACK') }
    const sql = await readFile(new URL('../../packages/db/prisma/migrations/20261120000000_multiple_tributes_per_author/migration.sql', import.meta.url), 'utf8')
    await db.query(sql)
    await db.query(sql)
    const result = await verifyTributes(db)
    assert.deepEqual(result, { old_index_removed: true, old_constraint_removed: true, regular_index_present: true,
      tributes: 0, notifications: counts.notifications, separateMessages: true, firstMessagePreserved: true, fixtureRolledBack: true })
    const after = (await db.query('SELECT (SELECT count(*)::int FROM app_tributes) AS tributes, (SELECT count(*)::int FROM app_notifications) AS notifications')).rows[0]
    assert.deepEqual(after, counts)
  } finally { await db.end() }
})
