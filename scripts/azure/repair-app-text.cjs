// Repair reviewed APP text values whose UTF-8 bytes were replaced by "?".
// No display-time guessing: a private manifest supplies exact before/after values.
const { readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')

const TARGETS = {
  app_bios: ['quote', 'text'],
  app_documents: ['title', 'description', 'file_name'],
  app_gallery_items: ['location', 'description'],
  app_geo_places: ['title', 'description', 'street', 'complement', 'neighborhood', 'city', 'state', 'country'],
  app_geolocations: ['place_name', 'address', 'city', 'state', 'country', 'section', 'notes'],
  app_tributes: ['text'],
  app_users: ['first_name', 'last_name', 'birth_city', 'birth_state', 'birth_country', 'notes', 'birth_place', 'death_place', 'death_cause', 'maiden_name', 'nickname'],
}
const SUSPICIOUS = '\\?{2,}|\uFFFD|[\u00C3\u00C2][\u0080-\u00BF]|\u00E2[\u0080-\u00BF\u20AC]|\u00F0[\u009F\u0178]'

function quote(name) {
  return '"' + name.replaceAll('"', '""') + '"'
}

// Preserve every intact character, including existing accents and punctuation.
// This checks a supplied original; it cannot infer which lost character was used.
function matchesLostUtf8(before, after) {
  let offset = 0
  let restored = false
  for (const character of after) {
    if (before.startsWith(character, offset)) {
      offset += character.length
    } else if (character.codePointAt(0) > 127) {
      const width = Buffer.byteLength(character, 'utf8')
      if (before.slice(offset, offset + width) !== '?'.repeat(width)) return false
      offset += width
      restored = true
    } else {
      return false
    }
  }
  return restored && offset === before.length
}

function validatePlan(plan) {
  if (plan?.version !== 1 || !Array.isArray(plan.repairs) || !plan.repairs.length) {
    throw new Error('Expected a version 1 manifest with a nonempty repairs array.')
  }
  const seen = new Set()
  for (const [index, repair] of plan.repairs.entries()) {
    const { table, column, id, before, after } = repair ?? {}
    if (!Object.hasOwn(TARGETS, table) || !TARGETS[table].includes(column)) {
      throw new Error('Repair ' + index + ': table/column is not an allowed APP text field.')
    }
    if (typeof id !== 'string' || !id.trim() || typeof before !== 'string' || typeof after !== 'string') {
      throw new Error('Repair ' + index + ': id, before and after must be nonempty identifiers/text values.')
    }
    if (!after.isWellFormed() || after.includes('\uFFFD') || !matchesLostUtf8(before, after)) {
      throw new Error('Repair ' + index + ': replacement must restore lost UTF-8 bytes and preserve intact text.')
    }
    const key = JSON.stringify([table, column, id])
    if (seen.has(key)) throw new Error('Repair ' + index + ': duplicate target.')
    seen.add(key)
  }
  return plan
}

function readPlan(bytes) {
  // Fail rather than silently replace malformed input with U+FFFD.
  let plan
  try {
    plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Manifest must be valid UTF-8 JSON.')
  }
  return validatePlan(plan)
}

async function audit(client, details = false) {
  const findings = []
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    await client.query("SET LOCAL statement_timeout = '20s'")
    for (const [table, columns] of Object.entries(TARGETS)) {
      for (const column of columns) {
        const result = await client.query(
          'SELECT count(*)::int AS count FROM public.' + quote(table) + ' WHERE ' + quote(column) + ' ~ $1',
          [SUSPICIOUS],
        )
        if (!result.rows[0].count) continue
        findings.push({ table, column, count: result.rows[0].count })
        if (details) {
          const rows = await client.query(
            'SELECT id, ' + quote(column) + ' AS value FROM public.' + quote(table) + ' WHERE ' + quote(column) + ' ~ $1 ORDER BY id',
            [SUSPICIOUS],
          )
          // Separate records avoid truncating long biography/audit log lines.
          for (const row of rows.rows) console.log(JSON.stringify({ action: 'text-audit-cell', table, column, ...row }))
        }
      }
    }
    await client.query('ROLLBACK')
    return { action: 'read-only-text-audit', findings }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

async function repairText(client, input, { apply = false, rollback = false, receipt } = {}) {
  const plan = validatePlan(input)
  const planSha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  let selected = plan.repairs
  if (rollback) {
    if (receipt?.action !== 'applied-text-repair' || receipt.planSha256 !== planSha256 || !Array.isArray(receipt.results)) {
      throw new Error('Rollback requires the successful apply receipt for this exact manifest.')
    }
    const updated = new Set(receipt.results.filter((row) => row.status === 'updated')
      .map(({ table, column, id }) => JSON.stringify([table, column, id])))
    selected = plan.repairs.filter(({ table, column, id }) => updated.has(JSON.stringify([table, column, id])))
    if (selected.length !== updated.size) throw new Error('Receipt contains a target outside the manifest.')
  }
  const results = []
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE' + (apply ? '' : ' READ ONLY'))
  try {
    await client.query("SET LOCAL statement_timeout = '20s'")
    await client.query("SET LOCAL lock_timeout = '5s'")
    // Stable lock order also makes overlapping repair manifests predictable.
    const repairs = [...selected].sort((a, b) =>
      JSON.stringify([a.table, a.id, a.column]).localeCompare(JSON.stringify([b.table, b.id, b.column])),
    )
    for (const { table, column, id, before, after } of repairs) {
      const expected = rollback ? after : before
      const replacement = rollback ? before : after
      const target = 'public.' + quote(table)
      const field = quote(column)
      const current = await client.query(
        'SELECT ' + field + ' AS value FROM ' + target + ' WHERE id = $1' + (apply ? ' FOR UPDATE' : ''),
        [id],
      )
      if (current.rowCount !== 1) throw new Error('Missing repair target: ' + table + '.' + column + ' (' + id + ').')
      if (current.rows[0].value === replacement) {
        results.push({ table, column, id, status: 'already-correct' })
        continue
      }
      if (current.rows[0].value !== expected) {
        throw new Error('Text changed since review: ' + table + '.' + column + ' (' + id + '). No repair committed.')
      }
      if (apply) {
        const updated = await client.query(
          'UPDATE ' + target + ' SET ' + field + ' = $1, updated_at = now() WHERE id = $2 AND ' + field + ' = $3 RETURNING ' + field + ' AS value',
          [replacement, id, expected],
        )
        if (updated.rowCount !== 1 || updated.rows[0].value !== replacement) {
          throw new Error('Repair verification failed. No repair committed.')
        }
      }
      results.push({ table, column, id, status: apply ? 'updated' : 'pending' })
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK')
    return {
      action: (rollback ? 'rollback-' : '') + (apply ? 'applied-text-repair' : 'read-only-text-preview'),
      planSha256,
      results,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  let planPath
  let receiptPath
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--plan') {
      planPath = args[++index]
      if (!planPath || planPath.startsWith('--')) throw new Error('--plan requires a file path.')
    } else if (args[index] === '--receipt') {
      receiptPath = args[++index]
      if (!receiptPath || receiptPath.startsWith('--')) throw new Error('--receipt requires a file path.')
    } else if (!['--apply', '--rollback', '--details'].includes(args[index])) {
      throw new Error('Usage: node scripts/azure/repair-app-text.cjs [--plan file.json] [--apply] [--rollback --receipt receipt.json] [--details]')
    }
  }
  const apply = args.includes('--apply') || process.env.APP_TEXT_REPAIR_APPLY === 'true'
  const rollback = args.includes('--rollback') || process.env.APP_TEXT_REPAIR_ROLLBACK === 'true'
  const details = args.includes('--details') || process.env.APP_TEXT_AUDIT_DETAILS === 'true'
  if (planPath && process.env.APP_TEXT_REPAIR_PLAN_B64) throw new Error('Supply one manifest source.')
  const plan = planPath
    ? readPlan(readFileSync(planPath))
    : process.env.APP_TEXT_REPAIR_PLAN_B64
      ? readPlan(Buffer.from(process.env.APP_TEXT_REPAIR_PLAN_B64, 'base64'))
      : undefined
  if ((apply || rollback) && !plan) throw new Error('Applying or rolling back a repair requires a reviewed manifest.')
  if (receiptPath && process.env.APP_TEXT_REPAIR_RECEIPT_B64) throw new Error('Supply one receipt source.')
  const receiptBytes = receiptPath
    ? readFileSync(receiptPath)
    : process.env.APP_TEXT_REPAIR_RECEIPT_B64
      ? Buffer.from(process.env.APP_TEXT_REPAIR_RECEIPT_B64, 'base64')
      : undefined
  let receipt
  if (receiptBytes) {
    try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes)) }
    catch { throw new Error('Receipt must be valid UTF-8 JSON.') }
  }
  if (rollback && !receipt) throw new Error('Rollback requires a successful apply receipt.')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const result = plan ? await repairText(client, plan, { apply, rollback, receipt }) : await audit(client, details)
    console.log(JSON.stringify(result))
  } finally {
    await client.end()
  }
}

module.exports = { matchesLostUtf8, validatePlan, readPlan, audit, repairText }
// invoke-database-task.ps1 evaluates this standalone source with node -e.
if (require.main === module || (process.env.DB_SCRIPT_B64 && !require.main)) {
  main().catch((error) => {
    // Do not print connection URLs, query parameters, credentials or user text.
    const message = error.code ? 'Text repair failed (' + error.code + '). No repair confirmed.' : error.message
    console.error(message)
    process.exitCode = 1
  })
}
