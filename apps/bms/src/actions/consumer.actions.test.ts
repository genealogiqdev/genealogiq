import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { grant, verify, mail, db, ServiceError } = vi.hoisted(() => {
  class ServiceError extends Error { constructor(readonly reason: string) { super(reason) } }
  return { grant: vi.fn(), verify: vi.fn(), mail: vi.fn(), ServiceError, db: {
    consumerAccessGrant: { update: vi.fn() }, appUser: { findFirst: vi.fn() },
    passwordResetToken: { create: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn(),
  } }
})
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/email', () => ({ sendConsumerPremiumEmail: mail }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))
vi.mock('@genealogiq/services/consumer-access', () => ({ grantConsumerPremium: grant, ConsumerAccessError: ServiceError }))

import { registerConsumer, resendConsumerAccessEmail } from './consumer.actions'
import { hashToken } from '@genealogiq/core'

const input = { requestId: 'e4ad9a98-7114-4fe5-9153-839edb0a2502', firstName: 'Ana', lastName: 'Silva', email: ' ANA@GENEALOGIQ.TEST ', notes: '' }
const granted = { id: 'gift-1', appUserId: 'consumer-1', email: 'ana@genealogiq.test', firstName: 'Ana', expiresAt: new Date('2027-10-07T15:00:00Z'), emailSentAt: null, credentialsCreated: true, alreadyGranted: false }
beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ user: { id: 'verified-admin' } })
  grant.mockResolvedValue(granted)
  db.appUser.findFirst.mockResolvedValue({ id: 'consumer-1', firstName: 'Ana', email: 'ana@genealogiq.test', consumerAccessGrants: [{ id: 'gift-1', expiresAt: granted.expiresAt }] })
  db.$transaction.mockResolvedValue([])
})

describe('BMS consumer access actions', () => {
  it('requires admin before registration, queries or sending email', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(registerConsumer(input)).rejects.toThrow('FORBIDDEN')
    await expect(resendConsumerAccessEmail('consumer-1')).rejects.toThrow('FORBIDDEN')
    expect(grant).not.toHaveBeenCalled()
    expect(db.appUser.findFirst).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
  })

  it.each([{ email: 'invalid' }, { firstName: ' ' }, { lastName: '' }, { notes: 'a'.repeat(501) }, { requestId: '' }])('rejects malformed input without a grant', async (override) => {
    expect(await registerConsumer({ ...input, ...override })).toEqual({ ok: false, message: 'errors.invalid-data' })
    expect(grant).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
  })

  it('uses verified actor and a strong hashed password, ignores tenant/plan/role injection, and mails after commit', async () => {
    mail.mockImplementation(async () => { expect(grant).toHaveBeenCalledOnce() })
    const response = await registerConsumer({ ...input, tenantId: 'funeral-1', createdById: 'attacker', role: 'SUPER_ADMIN', months: 120 } as typeof input)
    const args = grant.mock.calls[0][0]
    expect(args).toMatchObject({ firstName: 'Ana', email: 'ana@genealogiq.test', createdById: 'verified-admin', locale: 'pt-BR', currency: 'BRL' })
    expect(args).not.toHaveProperty('tenantId')
    expect(args).not.toHaveProperty('role')
    expect(args).not.toHaveProperty('months')
    const password = mail.mock.calls[0][0].password
    expect(password).toMatch(/^Gq![A-Za-z0-9_-]{24}$/)
    expect(bcrypt.getRounds(args.passwordHash)).toBe(12)
    expect(await bcrypt.compare(password, args.passwordHash)).toBe(true)
    expect(JSON.stringify(response)).not.toContain(password)
    expect(response).toEqual({ ok: true, message: 'granted', data: { appUserId: 'consumer-1', expiresAt: '2027-10-07T15:00:00.000Z', alreadyGranted: false, emailPending: false } })
    expect(db.consumerAccessGrant.update).toHaveBeenCalledWith({ where: { id: 'gift-1' }, data: { emailSentAt: expect.any(Date) } })
  })

  it('never sends a freshly generated password that was not assigned to the existing account', async () => {
    grant.mockResolvedValue({ ...granted, credentialsCreated: false })
    await registerConsumer(input)
    expect(mail.mock.calls[0][0]).not.toHaveProperty('password')
  })

  it('keeps a committed access successful when the provider rejects delivery', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mail.mockRejectedValue(new Error('Rejected'))
    try {
      expect(await registerConsumer(input)).toMatchObject({ ok: true, message: 'emailPending', data: { emailPending: true } })
      expect(grant).toHaveBeenCalledOnce()
      expect(db.consumerAccessGrant.update).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('a replay never resends a wrong password or another grant; pending delivery is explicit', async () => {
    grant.mockResolvedValue({ ...granted, credentialsCreated: false, alreadyGranted: true })
    expect(await registerConsumer(input)).toMatchObject({ ok: true, message: 'emailPending', data: { alreadyGranted: true, emailPending: true } })
    expect(mail).not.toHaveBeenCalled()
  })

  it('returns business rejection with no email', async () => {
    grant.mockRejectedValue(new ServiceError('partner-account'))
    expect(await registerConsumer(input)).toEqual({ ok: false, message: 'errors.partner-account' })
    expect(mail).not.toHaveBeenCalled()
  })

  it('resends a hashed 72-hour recovery link only for an active independent consumer with a live gift', async () => {
    const before = Date.now()
    expect(await resendConsumerAccessEmail('consumer-1')).toEqual({ ok: true, message: 'emailSent' })
    expect(db.appUser.findFirst.mock.calls[0][0].where).toEqual({ id: 'consumer-1', tenantId: null, role: 'APP_USER', isActive: true, email: { not: null } })
    const eligibleGift = db.appUser.findFirst.mock.calls[0][0].select.consumerAccessGrants.where
    expect(eligibleGift).toEqual({
      expiresAt: { gt: expect.any(Date) },
      appSale: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: expect.any(Date) } },
    })
    expect(eligibleGift.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before)
    expect(eligibleGift.appSale.currentPeriodEnd.gt.getTime()).toBeGreaterThanOrEqual(before)
    const raw = mail.mock.calls[0][0].token
    const saved = db.passwordResetToken.create.mock.calls[0][0].data
    expect(raw).toMatch(/^[a-f0-9]{64}$/)
    expect(saved.token).toBe(hashToken(raw))
    expect(saved.appUserId).toBe('consumer-1')
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 72 * 60 * 60 * 1000)
    expect(mail.mock.calls[0][0]).not.toHaveProperty('password')
    expect(grant).not.toHaveBeenCalled()
  })

  it('rejects an ineligible resend without tokens or email', async () => {
    db.appUser.findFirst.mockResolvedValue(null)
    expect(await resendConsumerAccessEmail('wrong-tenant')).toEqual({ ok: false, message: 'errors.recipient-unavailable' })
    expect(db.passwordResetToken.create).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
  })
})
