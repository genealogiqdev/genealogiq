import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkColumns, checkHistory, checkScope, migration } from '../production-mobile-release.mjs'

const env = { MOBILE_RELEASE_MODE: 'migrate', VERCEL_ENV: 'production', MOBILE_RELEASE_PROJECT: 'prj_ADnKLeafBavDDoSXs1jPR93WLqdO',
  DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@ep-holy-sky-b6d06m1d.c-2.sa-east-1.aws.neon.tech/neondb' }
const historical = ['20260406130806_add_owner_relation_to_customer', '20260406172552_add_tenant_scoping',
  '20260324165458_add_user_model', '20260325084009_add_email_verification_and_password_reset',
  '20260325100017_add_rate_limiting_and_email_change', '20260407000000_add_customer_modules', '20260415000000_add_tax_id_unique']
const tributes = '20261120000000_multiple_tributes_per_author'
const history = [...historical, tributes].map(migration_name => ({ migration_name, finished_at: '2026-11-20', rolled_back_at: null }))

test('release runs only for the APP production project against the production database', () => {
  for (const change of [{ VERCEL_ENV: 'preview' }, { MOBILE_RELEASE_PROJECT: 'prj_other' }, { VERCEL_PROJECT_ID: 'prj_other' },
    { DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@localhost/neondb' }, { MOBILE_RELEASE_MODE: 'preflight' }, { MOBILE_RELEASE_MODE: '' }]) {
    assert.throws(() => checkScope({ ...env, ...change }))
  }
  assert.equal(checkScope(env).searchParams.get('sslmode'), 'verify-full')
  assert.doesNotThrow(() => checkScope({ ...env, MOBILE_RELEASE_MODE: 'verify' }))
})

test('only the mobile migration may be pending, after the tribute migration', () => {
  assert.equal(migration, '20261122000000_mobile_push_and_genealogy_scan')
  assert.deepEqual(checkHistory(history, [tributes, migration]), { pending: [migration], canonicalApplied: 1, historicalApplied: 7 })
  assert.deepEqual(checkHistory([...history, { migration_name: migration, finished_at: '2026-11-24', rolled_back_at: null }], [tributes, migration]),
    { pending: [], canonicalApplied: 2, historicalApplied: 7 })
  // The tribute migration missing in production means this is not the expected database state.
  assert.throws(() => checkHistory(history.filter(row => row.migration_name !== tributes), [tributes, migration]), /delta mismatch/)
  assert.throws(() => checkHistory(history, [tributes, migration, '20261201000000_unreviewed']), /delta mismatch/)
  assert.throws(() => checkHistory([...history, { migration_name: migration, finished_at: null, rolled_back_at: null }], [tributes, migration]), /Unfinished/)
})

test('the new tables must carry exactly the mapped columns', () => {
  const rows = (table, columns) => columns.map(column_name => ({ table_name: table, column_name }))
  const push = ['id', 'user_id', 'token', 'platform', 'created_at', 'updated_at']
  const scans = ['id', 'app_user_id', 'request_id', 'surname', 'anchors', 'locale', 'status', 'session_id', 'graph', 'node_count',
    'edge_count', 'failure_code', 'list_cost_cents', 'last_synced_at', 'completed_at', 'created_at', 'updated_at']
  assert.equal(checkColumns([...rows('app_device_push_tokens', push), ...rows('app_genealogy_scans', scans)]), true)
  assert.throws(() => checkColumns([...rows('app_device_push_tokens', push.slice(1)), ...rows('app_genealogy_scans', scans)]), /app_device_push_tokens/)
  assert.throws(() => checkColumns(rows('app_device_push_tokens', push)), /app_genealogy_scans/)
})
