import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScope, checkHistory, migration } from '../production-tributes-release.mjs'

const env = { TRIBUTES_RELEASE_MODE: 'preflight', VERCEL_ENV: 'production',
  TRIBUTES_RELEASE_PROJECT: 'prj_ADnKLeafBavDDoSXs1jPR93WLqdO',
  DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@ep-holy-sky-b6d06m1d.c-2.sa-east-1.aws.neon.tech/neondb' }
const historical = ['20260406130806_add_owner_relation_to_customer', '20260406172552_add_tenant_scoping',
  '20260324165458_add_user_model', '20260325084009_add_email_verification_and_password_reset',
  '20260325100017_add_rate_limiting_and_email_change', '20260407000000_add_customer_modules', '20260415000000_add_tax_id_unique']
const history = historical.map(migration_name => ({ migration_name, finished_at: '2026-10-20', rolled_back_at: null }))

test('release rejects a different project, environment, database or missing publication gate', () => {
  for (const change of [{ VERCEL_ENV: 'preview' }, { TRIBUTES_RELEASE_PROJECT: 'another-project' },
    { VERCEL_PROJECT_ID: 'another-project' }, { DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@localhost/neondb' },
    { TRIBUTES_RELEASE_MODE: 'migrate' }, { TRIBUTES_RELEASE_MODE: 'unknown' }]) {
    assert.throws(() => checkScope({ ...env, ...change }))
  }
  assert.equal(checkScope(env).searchParams.get('sslmode'), 'verify-full')
  assert.doesNotThrow(() => checkScope({ ...env, TRIBUTES_RELEASE_MODE: 'migrate', TRIBUTES_APP_READY: '1' }))
})

test('only the named tribute migration may be pending; finished retries remain valid', () => {
  assert.deepEqual(checkHistory(history, [migration]), { pending: ['20261120000000_multiple_tributes_per_author'], canonicalApplied: 0, historicalApplied: 7 })
  assert.deepEqual(checkHistory([...history, { migration_name: migration, finished_at: '2026-11-20', rolled_back_at: null }], [migration]),
    { pending: [], canonicalApplied: 1, historicalApplied: 7 })
  assert.throws(() => checkHistory(history, [migration, '20261201000000_unreviewed_change']), /delta mismatch/)
  assert.throws(() => checkHistory([...history, { migration_name: migration, finished_at: null, rolled_back_at: null }], [migration]), /Unfinished/)
  assert.throws(() => checkHistory([...history, { migration_name: 'unknown', finished_at: '2026-11-20' }], [migration]), /delta mismatch/)
})
