import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// This launcher uses normal credentials/session/DAL checks against compose's
// local database. It never writes .env files or inherits provider credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apps = { app: 3000, bms: 3001, seq: 3002 }
const selection = process.argv.find((arg) => arg.startsWith('--app='))?.slice(6) ?? 'all'
if (process.argv.some((arg) => !arg.startsWith('--app=') && arg !== process.argv[0] && arg !== process.argv[1])) {
  throw new Error('Usage: node scripts/local-qa.mjs [--app=all|app|bms|seq]')
}
if (selection !== 'all' && !(selection in apps)) {
  throw new Error('Expected --app=all, app, bms, or seq')
}
const selected = Object.entries(apps).filter(([app]) => selection === 'all' || selection === app)

async function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(1000)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

if (!(await listening(5432))) throw new Error('Local PostgreSQL is unavailable. Run pnpm db:up first.')
for (const [app, port] of selected) {
  if (await listening(port)) throw new Error(`Port ${port} is already occupied; do not reuse an unidentified server.`)
  if (!existsSync(path.join(root, 'apps', app, 'node_modules', 'next', 'dist', 'bin', 'next'))) {
    throw new Error(`Next.js is missing for ${app}. Run pnpm install first.`)
  }
}
if (!existsSync(path.join(root, 'packages/db/src/generated/prisma/client.ts'))) {
  throw new Error('Prisma is not generated. Run pnpm db:generate first.')
}

const disabled = {
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', RESEND_API_KEY: '',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_AUTH_TOKEN: '', SENTRY_ORG: '', SENTRY_PROJECT: '',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '',
  TURNSTILE_SECRET_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
  CRON_SECRET: '', ENABLE_WIKITREE_SEARCH: 'false',
  AZURE_STORAGE_ACCOUNT_NAME: '', AZURE_STORAGE_ACCOUNT_URL: '',
  AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID: '',
}
const local = {
  DATABASE_URL: 'postgresql://genealogiq:genealogiq@127.0.0.1:5432/genealogiq',
  DATABASE_POOL_MAX: '5', AUTH_TRUST_HOST: 'true',
  APP_URL: 'http://localhost:3000', BMS_URL: 'http://localhost:3001', SEQUOIA_URL: 'http://localhost:3002',
  AZURE_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
  AZURE_STORAGE_MEDIA_CONTAINER: 'media', AZURE_STORAGE_STAGING_CONTAINER: 'media-staging',
  AZURE_STORAGE_MIGRATION_CONTAINER: 'media-migration',
  MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:10000/devstoreaccount1/media',
  NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:10000/devstoreaccount1/media',
}
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue
    if (process.platform === 'win32') {
      // Each PID comes directly from this launcher's spawn; stop its own tree.
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else child.kill('SIGTERM')
  }
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
for (const [app, port] of selected) {
  const appRoot = path.join(root, 'apps', app)
  const child = spawn(process.execPath, [path.join(appRoot, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, ...disabled, ...local, NODE_ENV: 'development', AUTH_SECRET: randomBytes(32).toString('hex'), AUTH_URL: `http://localhost:${port}` },
  })
  children.push(child)
  child.on('error', (error) => { console.error(`[local-qa:${app}] ${error.message}`); stop(1) })
  child.on('exit', (code) => { if (!stopping) { console.error(`[local-qa:${app}] stopped (${code})`); stop(code || 1) } })
  console.log(`[local-qa] ${app}: http://localhost:${port} (PID ${child.pid}); Ctrl+C stops this launcher's apps.`)
}
