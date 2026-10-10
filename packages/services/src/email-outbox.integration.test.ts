import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/email', () => ({ sendNotificationEmail: send }))
const url = process.env.EMAIL_OUTBOX_TEST_DATABASE_URL

describe.skipIf(!url)('email outbox on PostgreSQL', () => {
  let db: PrismaClient
  let outbox: typeof import('./email-outbox')
  const prefix = `email-${randomUUID()}`
  const message = { subject: 'Confirmação de teste', name: 'Ana', paragraphs: ['Seu produto está disponível.'], action: { label: 'Ver conta', url: 'https://genealogiq.com.br/subscriptions' } }
  const input = (suffix: string) => ({ id: `${prefix}:${suffix}`, recipient: `${prefix}@genealogiq.test`, message })

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback test database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    outbox = await import('./email-outbox')
  })
  beforeEach(() => { send.mockReset() })
  afterAll(async () => { await db?.$disconnect() })

  it('retains one immutable receipt when the business event is queued twice', async () => {
    const receipt = input('duplicate')
    await Promise.all([outbox.enqueueEmail(db, receipt), outbox.enqueueEmail(db, receipt)])
    await outbox.enqueueEmail(db, { ...receipt, recipient: 'different@genealogiq.test', message: { ...message, name: 'Changed' } })
    expect(await db.emailOutbox.count({ where: { id: receipt.id } })).toBe(1)
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ recipient: receipt.recipient, message, attempts: 0, sentAt: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('allows only one of two concurrent workers to deliver a receipt', async () => {
    const receipt = input('workers')
    await outbox.enqueueEmail(db, receipt)
    const result = await Promise.all([outbox.deliverEmail(receipt.id), outbox.deliverEmail(receipt.id)])
    expect(result).toContain('sent')
    expect(send).toHaveBeenCalledOnce()
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ attempts: 1, sentAt: expect.any(Date), processingUntil: null, claimToken: null })
    expect(await outbox.deliverEmail(receipt.id)).toBe('sent')
    expect(send).toHaveBeenCalledOnce()
  })

  it('persists a provider rejection and later records one successful retry', async () => {
    const receipt = input('retry')
    await outbox.enqueueEmail(db, receipt)
    send.mockRejectedValueOnce(new Error('synthetic provider outage'))
    expect(await outbox.deliverEmail(receipt.id)).toBe('pending')
    const failed = await db.emailOutbox.findUniqueOrThrow({ where: { id: receipt.id } })
    expect(failed).toMatchObject({ attempts: 1, sentAt: null, lastError: 'delivery-failed', claimToken: null })
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now())
    expect(await outbox.deliverEmail(receipt.id)).toBe('pending')
    expect(send).toHaveBeenCalledOnce()
    expect(await outbox.deliverEmail(receipt.id, { force: true })).toBe('sent')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][2]).toBe(send.mock.calls[1][2])
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ attempts: 2, sentAt: expect.any(Date), lastError: null })
  })

  it('rolls back the business write and queue together when enqueue fails', async () => {
    const receipt = input('rollback')
    await db.$executeRawUnsafe(`ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_test_failure CHECK (id <> '${receipt.id}')`)
    try {
      await expect(db.$transaction(async (tx) => {
        await tx.appUser.create({ data: { id: `${prefix}-rollback`, firstName: 'Test', lastName: 'Rollback' } })
        await outbox.enqueueEmail(tx, receipt)
      })).rejects.toThrow()
      expect(await db.appUser.findUnique({ where: { id: `${prefix}-rollback` } })).toBeNull()
      expect(await db.emailOutbox.count({ where: { id: receipt.id } })).toBe(0)
      expect(send).not.toHaveBeenCalled()
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_test_failure')
    }
  })

  it('cancels a pending receipt when the customer changes their email', async () => {
    const receipt = input('recipient')
    const user = await db.appUser.create({ data: { email: receipt.recipient, firstName: 'Ana', lastName: 'Silva' } })
    await outbox.enqueueEmail(db, { ...receipt, context: { type: 'app-user', appUserId: user.id } })
    await db.appUser.update({ where: { id: user.id }, data: { email: `${prefix}-changed@genealogiq.test` } })
    expect(await outbox.deliverEmail(receipt.id)).toBe('canceled')
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ canceledAt: expect.any(Date), sentAt: null, lastError: 'superseded' })
    expect(send).not.toHaveBeenCalled()
  })

  it('cancels an old GenCode receipt after undo and resale, while sending the new receipt', async () => {
    const receipt = input('code-original')
    const user = await db.appUser.create({ data: { email: receipt.recipient, firstName: 'Ana', lastName: 'Silva' } })
    const tenant = await db.tenant.create({ data: { email: `${prefix}-tenant@genealogiq.test`, entityType: 'COMPANY', name: 'Fixture', tradeName: 'Fixture', taxId: prefix, phone: '000' } })
    const first = new Date('2026-10-09T10:00:00Z')
    const second = new Date('2026-10-09T11:00:00Z')
    const code = await db.genCode.create({ data: { genCode: `${prefix}-code`, tenantId: tenant.id, status: 'SOLD', soldToAppUserId: user.id, soldAt: first, soldVia: 'PLATFORM' } })
    await outbox.enqueueEmail(db, { ...receipt, context: { type: 'gencode-sale', appUserId: user.id, genCode: code.genCode, soldAt: first.toISOString() } })
    await db.genCode.update({ where: { id: code.id }, data: { status: 'AVAILABLE', soldAt: null, soldToAppUserId: null, soldVia: null } })
    await db.genCode.update({ where: { id: code.id }, data: { status: 'SOLD', soldAt: second, soldToAppUserId: user.id, soldVia: 'PLATFORM' } })
    expect(await outbox.deliverEmail(receipt.id)).toBe('canceled')
    expect(send).not.toHaveBeenCalled()
    const current = input('code-replacement')
    await outbox.enqueueEmail(db, { ...current, context: { type: 'gencode-sale', appUserId: user.id, genCode: code.genCode, soldAt: second.toISOString() } })
    expect(await outbox.deliverEmail(current.id)).toBe('sent')
    expect(send).toHaveBeenCalledOnce()
  })
})
