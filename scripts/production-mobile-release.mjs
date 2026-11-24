// Run only in the reviewed APP production release of the mobile app (Nov 24, 2026).
// Ordinary builds do not run this job. It applies one additive migration that
// creates two new tables; no existing table or row changes.
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { captureSnapshot } from './production-b2b-migration.mjs'

const require = createRequire(import.meta.url)
export const migration = '20261122000000_mobile_push_and_genealogy_scan'
const project = 'prj_ADnKLeafBavDDoSXs1jPR93WLqdO'
// Applied in production before the canonical history existed; preserved as-is.
const historical = ['20260406130806_add_owner_relation_to_customer', '20260406172552_add_tenant_scoping',
  '20260324165458_add_user_model', '20260325084009_add_email_verification_and_password_reset',
  '20260325100017_add_rate_limiting_and_email_change', '20260407000000_add_customer_modules', '20260415000000_add_tax_id_unique']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function checkScope(env) {
  if (!['migrate', 'verify'].includes(env.MOBILE_RELEASE_MODE)
    || env.VERCEL_ENV !== 'production' || env.MOBILE_RELEASE_PROJECT !== project
    || (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== project)) throw new Error('Release scope required')
  const target = new URL(env.DATABASE_URL_UNPOOLED || '')
  if (target.hostname !== 'ep-holy-sky-b6d06m1d.c-2.sa-east-1.aws.neon.tech'
    || target.pathname !== '/neondb') throw new Error('Database target mismatch')
  target.searchParams.set('sslmode', 'verify-full')
  return target
}

export function checkHistory(history, names) {
  if (history.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Unfinished migration exists')
  const applied = history.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name)
  const pending = names.filter(name => !applied.includes(name))
  const unknown = applied.filter(name => !names.includes(name))
  if (pending.length > 1 || pending.some(name => name !== migration)
    || unknown.length !== historical.length || unknown.some(name => !historical.includes(name))) throw new Error('Migration delta mismatch')
  return { pending, canonicalApplied: applied.filter(name => names.includes(name)).length, historicalApplied: unknown.length }
}

const EXPECTED_COLUMNS = {
  app_device_push_tokens: ['id', 'user_id', 'token', 'platform', 'created_at', 'updated_at'],
  app_genealogy_scans: ['id', 'app_user_id', 'request_id', 'surname', 'anchors', 'locale', 'status', 'session_id', 'graph',
    'node_count', 'edge_count', 'failure_code', 'list_cost_cents', 'last_synced_at', 'completed_at', 'created_at', 'updated_at'],
}

/** Pure: the new tables carry exactly the columns the Prisma schema maps. */
export function checkColumns(rows) {
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = rows.filter(row => row.table_name === table).map(row => row.column_name).sort()
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`Column mismatch: ${table}`)
  }
  return true
}

export async function verifyMobile(db) {
  const columns = (await db.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [Object.keys(EXPECTED_COLUMNS)])).rows
  checkColumns(columns)
  const labels = (await db.query(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'GenealogyScanStatus' ORDER BY e.enumsortorder`)).rows.map(row => row.enumlabel)
  if (labels.join(',') !== 'RUNNING,COMPLETED,FAILED') throw new Error('Scan status enum mismatch')
  const counts = (await db.query(`SELECT (SELECT count(*)::int FROM app_users) AS users,
    (SELECT count(*)::int FROM app_device_push_tokens) AS device_tokens,
    (SELECT count(*)::int FROM app_genealogy_scans) AS scans`)).rows[0]
  // Write one row per table and roll back: proves keys, defaults and the owner
  // foreign key without leaving data behind.
  await db.query('BEGIN')
  try {
    await db.query("SET LOCAL lock_timeout = '5s'")
    const user = (await db.query('SELECT id FROM app_users ORDER BY id LIMIT 1')).rows[0]
    if (!user) throw new Error('Verification identity missing')
    await db.query(`INSERT INTO app_device_push_tokens (id, user_id, token, platform, updated_at)
      VALUES ($1, $2, $3, 'ios', now())`, [randomUUID(), user.id, `ExponentPushToken[release${Date.now()}]`])
    const scan = (await db.query(`INSERT INTO app_genealogy_scans (id, app_user_id, request_id, surname, updated_at)
      VALUES ($1, $2, $3, 'Release', now()) RETURNING status, node_count, locale`, [randomUUID(), user.id, randomUUID()])).rows[0]
    if (scan.status !== 'RUNNING' || scan.node_count !== 0 || scan.locale !== 'en-US') throw new Error('Scan defaults mismatch')
    return { ...counts, enum: labels, fixtureRolledBack: true }
  } finally { await db.query('ROLLBACK') }
}

async function backup(db, names, token) {
  if (!token) throw new Error('Private backup storage required')
  const { put, get } = createRequire(new URL('../packages/services/package.json', import.meta.url))('@vercel/blob')
  const snapshot = await captureSnapshot(db)
  snapshot.migrations = await Promise.all(names.map(async name => ({ name, sql: await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8') })))
  const bytes = gzipSync(Buffer.from(JSON.stringify(snapshot)))
  const blob = await put(`database-backups/mobile-2026-11-24/${randomUUID()}.json.gz`, bytes,
    { token, access: 'private', contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: false })
  const response = await get(blob.url, { token, access: 'private' })
  if (!response || response.statusCode !== 200 || !response.stream) throw new Error('Backup read failed')
  const verified = Buffer.from(await new Response(response.stream).arrayBuffer())
  if (sha256(bytes) !== sha256(verified)) throw new Error('Backup checksum mismatch')
  console.log('MOBILE_BACKUP_RECEIPT ' + JSON.stringify({ capturedAt: snapshot.captured_at, pathname: blob.pathname,
    bytes: bytes.length, sha256: sha256(bytes), tables: snapshot.tables.length }))
}

async function main() {
  const target = checkScope(process.env)
  const { Client } = require('pg')
  const db = new Client({ connectionString: target.href, enableChannelBinding: true, connectionTimeoutMillis: 20000 })
  await db.connect()
  try {
    const names = (await readdir('packages/db/prisma/migrations')).filter(name => name === '0_init' || /^\d{14}_/.test(name))
    const history = (await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations')).rows
    const state = checkHistory(history, names)
    const sql = await readFile(`packages/db/prisma/migrations/${migration}/migration.sql`)
    console.log('MOBILE_PREFLIGHT ' + JSON.stringify({ mode: process.env.MOBILE_RELEASE_MODE, ...state, canonicalExpected: names.length }))
    if (state.pending.length) {
      if (process.env.MOBILE_RELEASE_MODE !== 'migrate') throw new Error('Mobile migration not applied')
      await backup(db, names, process.env.BLOB_PRIVATE_READ_WRITE_TOKEN)
      const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
        { cwd: 'packages/db', env: { ...process.env, DATABASE_URL: target.href }, encoding: 'utf8' })
      if (result.status !== 0) throw new Error('Canonical migration failed')
    }
    const after = (await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations')).rows
    if (checkHistory(after, names).pending.length || !after.some(row => row.migration_name === migration
      && row.finished_at && !row.rolled_back_at && row.checksum === sha256(sql))) throw new Error('Post-migration history mismatch')
    console.log('MOBILE_MIGRATION_RECEIPT ' + JSON.stringify({ ...await verifyMobile(db), canonicalApplied: names.length, checksum: sha256(sql) }))
  } finally { await db.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('Mobile release stopped: ' + (error.message.includes('://') ? 'connection or provider failure' : error.message)); process.exitCode = 1 })
}
