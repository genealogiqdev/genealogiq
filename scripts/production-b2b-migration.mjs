// One reviewed release job. Run in the existing APP production build before promotion.
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
const { put, get } = createRequire(new URL('../packages/services/package.json', import.meta.url))('@vercel/blob')
const migration = '20261105010000_business_customers'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const identifier = name => '"' + name.replaceAll('"', '""') + '"'

export async function captureSnapshot(db) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const identity = (await db.query('SELECT current_database() AS database, current_timestamp::text AS captured_at, version() AS server_version')).rows[0]
    const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows
    const tables = []
    for (const { tablename } of names) {
      // Keep JSON as text. Parsing here would lose bigint/numeric precision.
      const rows = (await db.query(`SELECT row_to_json(t)::text AS data FROM public.${identifier(tablename)} t`)).rows.map(row => row.data)
      tables.push({ name: tablename, rows })
    }
    const columns = (await db.query("SELECT * FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows
    const constraints = (await db.query("SELECT c.conrelid::regclass::text AS table_name, c.conname AS name, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' ORDER BY c.conrelid, c.conname")).rows
    const indexes = (await db.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname")).rows
    const enums = (await db.query("SELECT t.typname, e.enumsortorder, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder")).rows
    const sequenceNames = (await db.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public'")).rows
    const sequences = []
    for (const { sequencename } of sequenceNames) sequences.push({ name: sequencename, state: (await db.query(`SELECT last_value::text, is_called FROM public.${identifier(sequencename)}`)).rows[0] })
    await db.query('COMMIT')
    return { format: 'genealogiq-row-snapshot-v1', ...identity, tables, columns, constraints, indexes, enums, sequences }
  } catch (error) { await db.query('ROLLBACK'); throw error }
}

async function main() {
  if (process.env.B2B_MIGRATE !== '1' || process.env.VERCEL_ENV !== 'production'
    || process.env.B2B_MIGRATION_PROJECT !== 'prj_ADnKLeafBavDDoSXs1jPR93WLqdO'
    || (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_PROJECT_ID !== process.env.B2B_MIGRATION_PROJECT)) throw new Error('Release scope required')
  const target = new URL(process.env.DATABASE_URL_UNPOOLED || '')
  if (target.hostname !== 'ep-holy-sky-b6d06m1d.c-2.sa-east-1.aws.neon.tech' || target.pathname !== '/neondb') throw new Error('Database target mismatch')
  target.searchParams.set('sslmode', 'verify-full')
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN
  if (!token) throw new Error('Private backup storage required')
  const db = new Client({ connectionString: target.href, enableChannelBinding: true, connectionTimeoutMillis: 20000 })
  await db.connect()
  try {
    const history = (await db.query('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations')).rows
    if (history.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Unfinished migration exists')
    const applied = history.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name)
    const names = (await readdir('packages/db/prisma/migrations')).filter(name => /^\d{14}_/.test(name))
    const pending = names.filter(name => !applied.includes(name))
    if (pending.length !== 1 || pending[0] !== migration || applied.some(name => !names.includes(name))) throw new Error('Migration delta mismatch')
    const snapshot = await captureSnapshot(db)
    snapshot.migrations = await Promise.all(names.filter(name => name !== migration).map(async name => ({ name, sql: await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8') })))
    const bytes = gzipSync(Buffer.from(JSON.stringify(snapshot)))
    const blob = await put(`database-backups/b2b-2026-11-05/${randomUUID()}.json.gz`, bytes,
      { token, access: 'private', contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: false })
    const restored = await get(blob.url, { token, access: 'private' })
    if (!restored || restored.statusCode !== 200 || !restored.stream) throw new Error('Backup read failed')
    const verified = Buffer.from(await new Response(restored.stream).arrayBuffer())
    if (sha256(verified) !== sha256(bytes)) throw new Error('Backup checksum mismatch')
    const counts = Object.fromEntries(snapshot.tables.map(table => [table.name, table.rows.length]))
    console.log('B2B_BACKUP_RECEIPT ' + JSON.stringify({ host: target.hostname, capturedAt: snapshot.captured_at, pathname: blob.pathname, bytes: bytes.length, sha256: sha256(bytes), applied: applied.length, tableCounts: counts }))
    const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { cwd: 'packages/db', env: { ...process.env, DATABASE_URL: target.href }, encoding: 'utf8' })
    if (result.status !== 0) throw new Error('Canonical migration failed')
    const after = (await db.query(`SELECT (SELECT count(*)::int FROM business_customers) AS companies,
      (SELECT count(*)::int FROM business_gencode_sales) AS lots,
      (SELECT count(*)::int FROM gencodes WHERE business_sale_id IS NOT NULL) AS assigned_codes,
      (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied`)).rows[0]
    if (after.applied !== names.length || after.companies || after.lots || after.assigned_codes) throw new Error('Post-migration state mismatch')
    console.log('B2B_MIGRATION_RECEIPT ' + JSON.stringify(after))
  } finally { await db.end() }
}
if (process.argv[1] && new URL(import.meta.url).pathname.endsWith('/' + process.argv[1].replaceAll('\\', '/').split('/').at(-1))) {
  main().catch(error => { console.error('B2B release stopped: ' + (error.message.includes('://') ? 'connection or provider failure' : error.message)); process.exitCode = 1 })
}
