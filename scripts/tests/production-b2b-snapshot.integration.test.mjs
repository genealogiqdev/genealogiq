import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { captureSnapshot } from '../production-b2b-migration.mjs'
const { Client } = createRequire(import.meta.url)('pg')
const url = process.env.B2B_TEST_DATABASE_URL
test('row snapshot restores exact numeric, bigint, binary, array and timestamp values', { skip: !url }, async () => {
  const target = new URL(url)
  assert.equal(target.hostname, '127.0.0.1')
  assert.match(target.pathname, /^\/genealogiq_coupon_qa_/)
  const db = new Client({ connectionString: url }); await db.connect()
  try {
    await db.query('CREATE TABLE b2b_snapshot_fixture (id bigint, amount numeric(25,6), bytes bytea, tags text[], created_at timestamp(6))')
    await db.query("INSERT INTO b2b_snapshot_fixture VALUES (9223372036854775806, 1234567890123456789.123456, decode('00aaff','hex'), ARRAY['Porcelana','Aço'], '2026-11-05 12:34:56.123456')")
    const snapshot = await captureSnapshot(db)
    const row = snapshot.tables.find(table => table.name === 'b2b_snapshot_fixture').rows[0]
    assert.match(row, /9223372036854775806/); assert.match(row, /1234567890123456789\.123456/)
    await db.query('CREATE TABLE b2b_snapshot_restored (LIKE b2b_snapshot_fixture INCLUDING ALL)')
    await db.query('INSERT INTO b2b_snapshot_restored SELECT * FROM json_populate_record(NULL::b2b_snapshot_restored, $1::json)', [row])
    const restored = (await db.query("SELECT id::text, amount::text, encode(bytes,'hex') AS bytes, tags, created_at::text FROM b2b_snapshot_restored")).rows[0]
    assert.deepEqual(restored, { id: '9223372036854775806', amount: '1234567890123456789.123456', bytes: '00aaff', tags: ['Porcelana','Aço'], created_at: '2026-11-05 12:34:56.123456' })
  } finally { await db.query('DROP TABLE IF EXISTS b2b_snapshot_restored, b2b_snapshot_fixture'); await db.end() }
})
