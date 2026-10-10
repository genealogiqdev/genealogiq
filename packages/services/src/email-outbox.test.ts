import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { db, send } = vi.hoisted(() => ({
  db: {
    emailOutbox: { createMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    appUser: { findUnique: vi.fn() }, appSale: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() }, partnerSubscription: { findUnique: vi.fn() }, genCode: { findFirst: vi.fn() },
  },
  send: vi.fn(),
}))
vi.mock('@genealogiq/db', () => ({ prisma: db }))
vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/email', () => ({ sendNotificationEmail: send }))
import { deliverEmail, enqueueEmail, runEmailOutbox, notificationUrl } from './email-outbox'

const now = new Date('2026-10-09T15:00:00Z')
const message = { subject: 'Compra confirmada', name: 'Ana', paragraphs: ['Seu produto está disponível.'], action: { label: 'Ver assinatura', url: 'https://genealogiq.com.br/subscriptions' } }
const row = { id: 'sale:one', recipient: 'ana@genealogiq.test', message, context: null, attempts: 0, sentAt: null, canceledAt: null, expiresAt: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.emailOutbox.findUnique.mockResolvedValue(row)
  db.emailOutbox.updateMany.mockResolvedValue({ count: 1 })
  db.appUser.findUnique.mockResolvedValue({ email: row.recipient, isActive: true, role: 'APP_USER' })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('durable email delivery', () => {
  it('creates a stable receipt without overwriting one on a replay', async () => {
    await enqueueEmail(db as never, { id: row.id, recipient: row.recipient, message })
    expect(db.emailOutbox.createMany).toHaveBeenCalledExactlyOnceWith({
      data: { id: 'sale:one', recipient: 'ana@genealogiq.test', message }, skipDuplicates: true,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('leases the message, sends with a stable provider key and records acceptance', async () => {
    expect(await deliverEmail(row.id)).toBe('sent')
    expect(db.emailOutbox.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'sale:one', sentAt: null, canceledAt: null, availableAt: { lte: now } },
      data: { attempts: { increment: 1 }, processingUntil: new Date('2026-10-09T15:05:00Z') },
    })
    expect(send).toHaveBeenCalledWith(row.recipient, message, expect.stringMatching(/^genealogiq\/[a-f0-9]{64}$/))
    expect(db.emailOutbox.updateMany.mock.calls[1][0]).toMatchObject({ data: { sentAt: now, claimToken: null, processingUntil: null, lastError: null } })
  })

  it.each([{ sentAt: now }, { canceledAt: now }])('never resends a completed receipt: %j', async (state) => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, ...state })
    expect(await deliverEmail(row.id)).toBe('sentAt' in state ? 'sent' : 'canceled')
    expect(send).not.toHaveBeenCalled()
    expect(db.emailOutbox.updateMany).not.toHaveBeenCalled()
  })

  it('does not steal another worker lease, including on a forced retry', async () => {
    db.emailOutbox.updateMany.mockResolvedValue({ count: 0 })
    expect(await deliverEmail(row.id, { force: true })).toBe('pending')
    expect(db.emailOutbox.updateMany.mock.calls[0][0].where).toMatchObject({ OR: [{ processingUntil: null }, { processingUntil: { lte: now } }] })
    expect(send).not.toHaveBeenCalled()
  })

  it('retains a provider failure for retry with the same provider key', async () => {
    send.mockRejectedValueOnce(new Error('private provider payload'))
    expect(await deliverEmail(row.id)).toBe('pending')
    expect(db.emailOutbox.updateMany.mock.calls[1][0]).toMatchObject({ data: { lastError: 'delivery-failed', availableAt: new Date('2026-10-09T15:01:00Z'), claimToken: null } })
    expect(await deliverEmail(row.id, { force: true })).toBe('sent')
    expect(send.mock.calls[0][2]).toBe(send.mock.calls[1][2])
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private provider payload')
  })

  it('cancels an expired notice without sending, but preserves a worker already holding it', async () => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, expiresAt: now })
    expect(await deliverEmail(row.id)).toBe('canceled')
    db.emailOutbox.updateMany.mockResolvedValue({ count: 0 })
    expect(await deliverEmail(row.id)).toBe('pending')
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    null, { email: 'changed@genealogiq.test', isActive: true, role: 'APP_USER' },
    { email: row.recipient, isActive: false, role: 'APP_USER' },
    { email: row.recipient, isActive: true, role: 'APP_MEMO' },
  ])('cancels mail whose login recipient is no longer eligible: %j', async (user) => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, context: { type: 'app-user', appUserId: 'buyer-1' } })
    db.appUser.findUnique.mockResolvedValue(user)
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
  })

  it('does not warn of payment failure after the same invoice was paid', async () => {
    db.emailOutbox.findUnique.mockImplementation(({ where }) => where.id === 'invoice:paid' ? { id: 'invoice:paid' }
      : { ...row, context: { type: 'app-user', appUserId: 'buyer-1', supersededBy: 'invoice:paid' } })
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
  })

  it('suppresses a revoked sale and an extended access term', async () => {
    db.emailOutbox.findUnique.mockResolvedValueOnce({ ...row, context: { type: 'consumer-sale', appUserId: 'buyer-1', saleId: 'gift-1' } })
      .mockResolvedValueOnce({ ...row, context: { type: 'consumer-term', appUserId: 'buyer-1', endAt: '2026-11-08T15:00:00Z' } })
    db.appSale.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ currentPeriodEnd: new Date('2027-11-08T15:00:00Z') })
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
  })

  it('suppresses an old partner cycle after renewal', async () => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, context: { type: 'partner-cycle', subscriptionId: 'sub-1', cycleId: 'cycle-old' } })
    db.partnerSubscription.findUnique.mockResolvedValue({ currentCycleId: 'cycle-new', status: 'ACTIVE', tenant: { email: row.recipient, isActive: true } })
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
  })

  it('suppresses an undone or replaced GenCode sale', async () => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, context: { type: 'gencode-sale', appUserId: 'buyer-1', genCode: 'GEN-1', soldAt: now.toISOString() } })
    db.genCode.findFirst.mockResolvedValue(null)
    expect(await deliverEmail(row.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
    expect(db.genCode.findFirst).toHaveBeenCalledWith({ where: {
      genCode: 'GEN-1', soldToAppUserId: 'buyer-1', soldAt: now, soldVia: 'PLATFORM', status: { in: ['SOLD', 'ACTIVATED'] },
    }, select: { id: true } })
  })

  it('delivers the code when its original sale still belongs to the recipient', async () => {
    db.emailOutbox.findUnique.mockResolvedValue({ ...row, context: { type: 'gencode-sale', appUserId: 'buyer-1', genCode: 'GEN-1', soldAt: now.toISOString() } })
    db.genCode.findFirst.mockResolvedValue({ id: 'code-1' })
    expect(await deliverEmail(row.id)).toBe('sent')
    expect(send).toHaveBeenCalledOnce()
  })

  it('bounds the retry batch and reports individual results', async () => {
    db.emailOutbox.findMany.mockResolvedValue([{ id: 'one' }, { id: 'two' }])
    db.emailOutbox.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, canceledAt: now })
    expect(await runEmailOutbox(now)).toEqual({ sent: 1, pending: 0, canceled: 1 })
    expect(db.emailOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, where: expect.objectContaining({ availableAt: { lte: now }, sentAt: null, canceledAt: null }) }))
  })
})

it('uses configured canonical origins and stable production defaults', () => {
  vi.stubEnv('APP_URL', '')
  vi.stubEnv('SEQUOIA_URL', 'https://sequoia.example/')
  expect(notificationUrl('app', '/subscriptions')).toBe('https://genealogiq.com.br/subscriptions')
  expect(notificationUrl('seq', '/purchasing/plans')).toBe('https://sequoia.example/purchasing/plans')
})
