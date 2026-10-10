import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, queue, deliver, push, callbacks } = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), notification: { create: vi.fn() }, appUser: { findUnique: vi.fn() } },
  queue: vi.fn(), deliver: vi.fn(), push: vi.fn(), callbacks: [] as (() => Promise<void>)[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => callbacks.push(fn) }))
vi.mock('@/lib/push', () => ({ sendPushForNotification: push }))
vi.mock('@genealogiq/services/email-outbox', () => ({ enqueueEmail: queue, deliverEmail: deliver, notificationUrl: () => 'https://genealogiq.com.br/messages' }))
import { notify } from './notifications'

beforeEach(() => {
  vi.resetAllMocks(); callbacks.length = 0
  db.$transaction.mockImplementation(async (fn) => fn(db))
  db.notification.create.mockResolvedValue({ id: 'notice-1' })
  db.appUser.findUnique.mockResolvedValue({ email: 'ana@genealogiq.test', firstName: 'Ana', isActive: true, role: 'APP_USER' })
  queue.mockResolvedValue('activity:notice-1')
})

describe('APP activity notifications', () => {
  it('stores the notice and generic email together before delivering after the response', async () => {
    await notify({ type: 'GUARDIAN_REQUEST_PENDING', userId: 'recipient-1', actorId: 'sender-1', appUserGuardianId: 'request-1' })
    expect(queue).toHaveBeenCalledWith(db, expect.objectContaining({
      id: 'activity:notice-1', recipient: 'ana@genealogiq.test', context: { type: 'app-user', appUserId: 'recipient-1' },
      message: expect.objectContaining({ paragraphs: ['Você recebeu uma solicitação de acesso como guardião.', 'Entre na sua conta para consultar os detalhes.'], action: { label: 'Ver minhas notificações', url: 'https://genealogiq.com.br/messages' } }),
    }))
    expect(deliver).not.toHaveBeenCalled()
    await callbacks[0]()
    expect(deliver).toHaveBeenCalledExactlyOnceWith('activity:notice-1')
    expect(push).toHaveBeenCalledOnce()
  })

  it('stores self activity without sending the actor an email', async () => {
    await notify({ type: 'TRIBUTE_APPROVED', userId: 'same', actorId: 'same' })
    expect(db.notification.create).toHaveBeenCalledOnce()
    expect(queue).not.toHaveBeenCalled()
  })

  it.each([null, { email: null, isActive: true, role: 'APP_USER' }, { email: 'pet@genealogiq.test', isActive: true, role: 'APP_PET' }, { email: 'inactive@genealogiq.test', isActive: false, role: 'APP_USER' }])('skips ineligible email recipients: %j', async (user) => {
    db.appUser.findUnique.mockResolvedValue(user)
    await notify({ type: 'FAMILY_REQUEST_PENDING', userId: 'recipient-1' })
    expect(queue).not.toHaveBeenCalled()
  })

  it('does not schedule delivery after a failed notification transaction', async () => {
    queue.mockRejectedValue(new Error('outbox unavailable'))
    await expect(notify({ type: 'TRIBUTE_PENDING', userId: 'recipient-1' })).rejects.toThrow('outbox unavailable')
    expect(callbacks).toHaveLength(0)
    expect(deliver).not.toHaveBeenCalled()
  })
})
