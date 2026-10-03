import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, limiter } = vi.hoisted(() => ({
  db: { qrCode: { findUnique: vi.fn(), update: vi.fn() }, qrScan: { create: vi.fn() }, $transaction: vi.fn() },
  limiter: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@genealogiq/services/rate-limit', () => ({ checkRateLimit: limiter }))
import { POST } from './route'

beforeEach(() => vi.resetAllMocks())
const request = (body: string) => new NextRequest('http://localhost:3000/api/analytics/qr-scan', { method: 'POST', body })

describe('public QR scan boundary', () => {
  it('rejects malformed input without looking up a QR', async () => {
    expect((await POST(request('{'))).status).toBe(400)
    expect((await POST(request('{}'))).status).toBe(400)
    expect(db.qrCode.findUnique).not.toHaveBeenCalled()
  })
  it('does not record a scan for a missing profile QR', async () => {
    db.qrCode.findUnique.mockResolvedValue(null)
    expect((await POST(request('{"profileId":"missing"}'))).status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('returns the limiter retry interval without a database write', async () => {
    db.qrCode.findUnique.mockResolvedValue({ id: 'qr-1' })
    limiter.mockResolvedValue({ allowed: false, retryAfter: 17 })
    const response = await POST(request('{"profileId":"profile-1"}'))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('records one scan and counter increment in the same transaction', async () => {
    db.qrCode.findUnique.mockResolvedValue({ id: 'qr-1' })
    limiter.mockResolvedValue({ allowed: true })
    db.qrScan.create.mockReturnValue('scan-write')
    db.qrCode.update.mockReturnValue('counter-write')
    db.$transaction.mockResolvedValue([])
    const response = await POST(request('{"profileId":"profile-1"}'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(db.qrCode.findUnique).toHaveBeenCalledWith({ where: { appUserId: 'profile-1' }, select: { id: true } })
    expect(db.qrScan.create).toHaveBeenCalledWith({ data: { qrCodeId: 'qr-1', userAgent: undefined, ipHash: null } })
    expect(db.qrCode.update).toHaveBeenCalledWith({ where: { id: 'qr-1' }, data: { scanCount: { increment: 1 }, lastScannedAt: expect.any(Date) } })
    expect(db.$transaction).toHaveBeenCalledWith(['scan-write', 'counter-write'])
  })
})
