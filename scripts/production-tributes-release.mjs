// Run only in the reviewed APP production release. Ordinary builds do not run this job.
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { captureSnapshot } from './production-b2b-migration.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const { put, get } = createRequire(new URL('../packages/services/package.json', import.meta.url))('@vercel/blob')
export const migration = '20261120000000_multiple_tributes_per_author'
const project = 'prj_ADnKLeafBavDDoSXs1jPR93WLqdO'
const historical = ['20260406130806_add_owner_relation_to_customer', '20260406172552_add_tenant_scoping',
  '20260324165458_add_user_model', '20260325084009_add_email_verification_and_password_reset',
  '20260325100017_add_rate_limiting_and_email_change', '20260407000000_add_customer_modules', '20260415000000_add_tax_id_unique']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function checkScope(env) {
  if (!['preflight', 'migrate', 'verify'].includes(env.TRIBUTES_RELEASE_MODE)
    || env.VERCEL_ENV !== 'production' || env.TRIBUTES_RELEASE_PROJECT !== project
    || (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== project)) throw new Error('Release scope required')
  if (env.TRIBUTES_RELEASE_MODE === 'migrate' && env.TRIBUTES_APP_READY !== '1') throw new Error('Publish the ID-based APP first')
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

export async function verifyTributes(db) {
  const shape = (await db.query(`SELECT
    to_regclass('public.tributes_app_author_profile_key') IS NULL AS old_index_removed,
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app_tributes'::regclass AND conname = 'tributes_app_author_profile_key') AS old_constraint_removed,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'app_tributes'
      AND indexname = 'tributes_app_author_profile_idx' AND indexdef NOT LIKE '%UNIQUE%') AS regular_index_present`)).rows[0]
  if (!shape.old_index_removed || !shape.old_constraint_removed || !shape.regular_index_present) throw new Error('Tribute index mismatch')
  const counts = (await db.query('SELECT (SELECT count(*)::int FROM app_tributes) AS tributes, (SELECT count(*)::int FROM app_notifications) AS notifications')).rows[0]
  // All synthetic rows and the selected-ID edit are rolled back. No real message is edited.
  await db.query('BEGIN')
  try {
    await db.query("SET LOCAL lock_timeout = '5s'")
    const user = (await db.query('SELECT id FROM app_users ORDER BY id LIMIT 1')).rows[0]
    if (!user) throw new Error('Tribute verification identity missing')
    const ids = [randomUUID(), randomUUID()]
    await db.query(`INSERT INTO app_tributes (id, text, status, app_author_id, app_profile_id)
      VALUES ($1, 'Release first memory', 'APPROVED', $3, $3), ($2, 'Release second memory', 'PENDING', $3, $3)`, [...ids, user.id])
    await db.query("UPDATE app_tributes SET text = 'Release edited second memory' WHERE id = $1", [ids[1]])
    const rows = (await db.query('SELECT id, text, status FROM app_tributes WHERE id = ANY($1::text[])', [ids])).rows
    if (rows.length !== 2 || !rows.some(row => row.id === ids[0] && row.text === 'Release first memory' && row.status === 'APPROVED')
      || !rows.some(row => row.id === ids[1] && row.text === 'Release edited second memory' && row.status === 'PENDING')) throw new Error('Selected-ID verification failed')
    return { ...shape, ...counts, separateMessages: true, firstMessagePreserved: true, fixtureRolledBack: true }
  } finally { await db.query('ROLLBACK') }
}

async function backup(db, names, token) {
  if (!token) throw new Error('Private backup storage required')
  const snapshot = await captureSnapshot(db)
  snapshot.migrations = await Promise.all(names.map(async name => ({ name, sql: await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8') })))
  const bytes = gzipSync(Buffer.from(JSON.stringify(snapshot)))
  const blob = await put(`database-backups/tributes-2026-11-20/${randomUUID()}.json.gz`, bytes,
    { token, access: 'private', contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: false })
  const response = await get(blob.url, { token, access: 'private' })
  if (!response || response.statusCode !== 200 || !response.stream) throw new Error('Backup read failed')
  const verified = Buffer.from(await new Response(response.stream).arrayBuffer())
  if (sha256(bytes) !== sha256(verified)) throw new Error('Backup checksum mismatch')
  console.log('TRIBUTES_BACKUP_RECEIPT ' + JSON.stringify({ capturedAt: snapshot.captured_at, pathname: blob.pathname,
    bytes: bytes.length, sha256: sha256(bytes), tableCounts: Object.fromEntries(snapshot.tables.map(table => [table.name, table.rows.length])) }))
}

async function main() {
  const target = checkScope(process.env)
  const db = new Client({ connectionString: target.href, enableChannelBinding: true, connectionTimeoutMillis: 20000 })
  await db.connect()
  try {
    const names = (await readdir('packages/db/prisma/migrations')).filter(name => name === '0_init' || /^\d{14}_/.test(name))
    const history = (await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations')).rows
    const state = checkHistory(history, names)
    const sql = await readFile(`packages/db/prisma/migrations/${migration}/migration.sql`)
    const alreadyApplied = history.find(row => row.migration_name === migration && row.finished_at && !row.rolled_back_at)
    if (alreadyApplied && alreadyApplied.checksum !== sha256(sql)) throw new Error('Tribute migration checksum mismatch')
    console.log('TRIBUTES_PREFLIGHT ' + JSON.stringify({ mode: process.env.TRIBUTES_RELEASE_MODE, ...state, canonicalExpected: names.length }))
    if (process.env.TRIBUTES_RELEASE_MODE === 'preflight') {
      await backup(db, names, process.env.BLOB_PRIVATE_READ_WRITE_TOKEN)
      return
    }
    if (state.pending.length) {
      if (process.env.TRIBUTES_RELEASE_MODE !== 'migrate') throw new Error('Tribute migration not applied')
      await backup(db, names, process.env.BLOB_PRIVATE_READ_WRITE_TOKEN)
      const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
        { cwd: 'packages/db', env: { ...process.env, DATABASE_URL: target.href }, encoding: 'utf8' })
      if (result.status !== 0) throw new Error('Canonical migration failed')
    }
    const after = (await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations')).rows
    if (checkHistory(after, names).pending.length || !after.some(row => row.migration_name === migration
      && row.finished_at && !row.rolled_back_at && row.checksum === sha256(sql))) throw new Error('Post-migration history mismatch')
    console.log('TRIBUTES_MIGRATION_RECEIPT ' + JSON.stringify({ ...await verifyTributes(db), canonicalApplied: names.length, checksum: sha256(sql) }))
  } finally { await db.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('Tribute release stopped: ' + (error.message.includes('://') ? 'connection or provider failure' : error.message)); process.exitCode = 1 })
}
