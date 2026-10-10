import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@genealogiq/services/partner-lifecycle', () => ({ sweepPartnerLifecycle: vi.fn() }))
vi.mock('@genealogiq/services/partner-notifications', () => ({ runPartnerNotifications: vi.fn(), runTrialNotifications: vi.fn() }))
vi.mock('@genealogiq/services/reconciliation', () => ({ reconcile: vi.fn() }))
vi.mock('@genealogiq/services/storage-usage', () => ({ sampleStorageUsage: vi.fn() }))
vi.mock('@genealogiq/services/email-outbox', () => ({ runEmailOutbox: vi.fn() }))

import { GET } from './route'
import { sweepPartnerLifecycle } from '@genealogiq/services/partner-lifecycle'
import { runPartnerNotifications, runTrialNotifications } from '@genealogiq/services/partner-notifications'
import { reconcile } from '@genealogiq/services/reconciliation'
import { sampleStorageUsage } from '@genealogiq/services/storage-usage'
import { runEmailOutbox } from '@genealogiq/services/email-outbox'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'unit-only-secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

function request(authorization?: string) {
  return new NextRequest('http://localhost:3001/api/cron/daily', { headers: authorization ? { authorization } : {} })
}

describe('daily job boundary and independent bookkeeping', () => {
  it('rejects an unsigned request before invoking any side effect', async () => {
    expect((await GET(request())).status).toBe(401)
    for (const service of [sweepPartnerLifecycle, runPartnerNotifications, runTrialNotifications, reconcile, sampleStorageUsage, runEmailOutbox]) {
      expect(service).not.toHaveBeenCalled()
    }
  })

  it('reports an unavailable configuration without running the job', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await GET(request('Bearer unit-only-secret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'not configured' })
    expect(sweepPartnerLifecycle).not.toHaveBeenCalled()
  })

  it('keeps reconciliation and storage evidence when notifications fail', async () => {
    vi.mocked(sweepPartnerLifecycle).mockResolvedValue({ expired: 2 } as never)
    vi.mocked(runPartnerNotifications).mockRejectedValue(new Error('email unavailable'))
    vi.mocked(runTrialNotifications).mockResolvedValue({ sent: 0 } as never)
    vi.mocked(runEmailOutbox).mockResolvedValue({ sent: 2, pending: 1, canceled: 0 })
    vi.mocked(sampleStorageUsage).mockResolvedValue({ bytes: 12 } as never)
    vi.mocked(reconcile).mockResolvedValue({
      checked: 3,
      findings: [{ severity: 'critical', check: 'ledger', subject: 'grant-1', detail: 'expected 2, observed 1' }],
    } as never)

    const response = await GET(request('Bearer unit-only-secret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true, sweep: { expired: 2 }, renewals: { error: 'Error: email unavailable' },
      reconciliation: { checked: 3, critical: 1, warnings: 0 }, storage: { bytes: 12 }, emails: { sent: 2, pending: 1, canceled: 0 },
    })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('grant-1'))
  })
})
