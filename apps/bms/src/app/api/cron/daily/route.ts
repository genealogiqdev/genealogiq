import { NextRequest, NextResponse } from 'next/server'
import { sweepPartnerLifecycle } from '@genealogiq/services/partner-lifecycle'
import { runPartnerNotifications, runTrialNotifications } from '@genealogiq/services/partner-notifications'
import { reconcile } from '@genealogiq/services/reconciliation'
import { sampleStorageUsage } from '@genealogiq/services/storage-usage'
import { runEmailOutbox } from '@genealogiq/services/email-outbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The reconciliation walks Stripe invoice by invoice; the default would cut it
// off mid-report, which is worse than a slow run because a truncated report
// reads like a clean one.
export const maxDuration = 300

/**
 * The one scheduled job.
 *
 * The founder's spec lists nine moments — D-90 through D+31, plus a daily
 * expiry sweep — and the obvious reading is nine schedules. This is one, for a
 * reason that is half platform and half design.
 *
 * The platform half: the Vercel team is on Hobby, where a cron may run at most
 * once a day and fires anywhere inside the hour it was asked for. Nine
 * schedules would be nine chances to drift apart from each other.
 *
 * The design half: every one of those moments is a question about a date the
 * database already knows. Computing them in one pass means they cannot disagree
 * about what day it is.
 *
 * And what runs here is BOOKKEEPING, not enforcement. Credit expiry is applied
 * on read — see credits.ts — so a run that is late, or never happens, cannot
 * let anyone activate on a dead credit. This materialises the ledger rows,
 * sends the warnings and reports discrepancies; it is not the thing standing
 * between a partner and their balance.
 *
 * The three steps are deliberately independent. A failure in notifications must
 * not stop reconciliation from reporting, and neither must stop the sweep — one
 * broken email provider should not blind the whole job.
 */
export async function GET(req: NextRequest) {
  // Vercel signs cron invocations with this header. Without the check the route
  // is a public endpoint that mutates contract state.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const startedAt = Date.now()
  const seqUrl = process.env.SEQUOIA_URL ?? ''
  const appUrl = process.env.APP_URL ?? ''

  const steps = await Promise.allSettled([
    sweepPartnerLifecycle(),
    runPartnerNotifications(seqUrl),
    runTrialNotifications(appUrl),
    reconcile(),
    // Measurement, not a gate. The quotas count files while the bill counts
    // bytes, and this is the only thing telling us how far apart those two are.
    sampleStorageUsage(),
  ])

  const [sweep, renewals, trials, report, storage] = steps
  // Run after producers so notices queued by this batch can be delivered now.
  const [emails] = await Promise.allSettled([runEmailOutbox()])
  const result = {
    sweep:        sweep.status     === 'fulfilled' ? sweep.value     : { error: String(sweep.reason) },
    renewals:     renewals.status  === 'fulfilled' ? renewals.value  : { error: String(renewals.reason) },
    trials:       trials.status    === 'fulfilled' ? trials.value    : { error: String(trials.reason) },
    reconciliation: report.status  === 'fulfilled'
      ? {
          checked:  report.value.checked,
          critical: report.value.findings.filter((f) => f.severity === 'critical').length,
          warnings: report.value.findings.filter((f) => f.severity === 'warning').length,
        }
      : { error: String(report.reason) },
    storage: storage.status === 'fulfilled' ? storage.value : { error: String(storage.reason) },
    emails: emails.status === 'fulfilled' ? emails.value : { error: 'Email retry unavailable' },
    ms: Date.now() - startedAt,
  }

  // Findings are logged individually rather than summarised away: on Hobby a
  // runtime log survives an hour, so the only chance anyone has of seeing WHICH
  // grant disagreed with its ledger is right here, right now.
  if (report.status === 'fulfilled') {
    for (const f of report.value.findings) {
      console[f.severity === 'critical' ? 'error' : 'warn'](
        `[cron:reconcile] ${f.severity} ${f.check} — ${f.subject}: ${f.detail}`,
      )
    }
  }

  console.log('[cron:daily]', JSON.stringify(result))
  return NextResponse.json({ ok: true, ...result })
}
