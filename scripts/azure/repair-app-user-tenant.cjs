const { Client } = require('pg')

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const email = (option('--email') ?? process.env.REPAIR_EMAIL)?.trim().toLowerCase()
const referenceEmails = (option('--reference-emails') ?? process.env.REFERENCE_EMAILS)
  ?.split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
const assign = process.argv.includes('--assign') || process.env.REPAIR_ASSIGN === 'true'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!email || !referenceEmails || referenceEmails.length < 2) {
  throw new Error('Usage: --email <app-user-email> --reference-emails <email1,email2> [--assign]')
}

void (async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')

    const targetResult = await client.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role::text AS role,
            u.is_active, u.tenant_id, t.name AS tenant_name, t.is_active AS tenant_is_active
       FROM public.app_users AS u
       LEFT JOIN public.tenants AS t ON t.id = u.tenant_id
      WHERE lower(u.email) = $1`,
    [email],
  )
    if (targetResult.rowCount !== 1) {
      throw new Error(`Expected one app user for ${email}; found ${targetResult.rowCount}`)
    }
    const target = targetResult.rows[0]
    if (target.role !== 'APP_USER' || !target.is_active) {
      throw new Error('Target must be an active APP_USER')
    }

    const referencesResult = await client.query(
    `SELECT t.id, t.name, t.is_active,
            array_agg(lower(u.email) ORDER BY lower(u.email)) AS reference_emails
       FROM public.tenants AS t
       JOIN public.app_users AS u ON u.tenant_id = t.id
      WHERE t.is_active = true
        AND lower(u.email) = ANY($1::text[])
      GROUP BY t.id, t.name, t.is_active
     HAVING count(DISTINCT lower(u.email)) = cardinality($1::text[])`,
    [referenceEmails],
  )
    if (referencesResult.rowCount !== 1) {
      throw new Error(`Expected one active tenant containing all reference accounts; found ${referencesResult.rowCount}`)
    }
    const tenant = referencesResult.rows[0]

    const guardiansResult = await client.query(
      `SELECT g.status, m.first_name, m.last_name, m.role::text AS role
         FROM public.app_user_guardians AS g
         JOIN public.app_users AS m ON m.id = g.app_user_id
        WHERE g.guardian_id = $1
        ORDER BY m.first_name, m.last_name`,
      [target.id],
    )

    if (target.tenant_id && target.tenant_id !== tenant.id) {
      throw new Error(`Target is already assigned to a different tenant (${target.tenant_id}); refusing to move it`)
    }

    if (assign && !target.tenant_id) {
      const updated = await client.query(
      `UPDATE public.app_users
          SET tenant_id = $1, updated_at = now()
        WHERE id = $2 AND tenant_id IS NULL AND role = 'APP_USER' AND is_active = true
        RETURNING id`,
      [tenant.id, target.id],
    )
      if (updated.rowCount !== 1) throw new Error('Guarded update did not affect exactly one row')
    }

    const finalResult = await client.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role::text AS role,
            u.is_active, u.tenant_id, t.name AS tenant_name
       FROM public.app_users AS u
       JOIN public.tenants AS t ON t.id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2`,
    [target.id, tenant.id],
  )
    if (assign && finalResult.rowCount !== 1) throw new Error('Post-update verification failed')

    await client.query(assign ? 'COMMIT' : 'ROLLBACK')
    console.log(JSON.stringify({
      action: assign ? (target.tenant_id ? 'already-assigned' : 'assigned') : 'read-only-preview',
      target: assign ? finalResult.rows[0] : target,
      targetTenant: { id: tenant.id, name: tenant.name },
      referenceEmails: tenant.reference_emails,
      guardianMemorials: guardiansResult.rows,
    }, null, 2))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
})().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
