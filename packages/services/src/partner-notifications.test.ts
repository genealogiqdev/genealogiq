import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, outbox, lifecycleMock, trialMock, creditsMock } = vi.hoisted(() => ({
  prismaMock: {
    stripeEvent:         { findUnique: vi.fn() },
    emailOutbox:         { findUnique: vi.fn() },
    partnerSubscription: { findUnique: vi.fn() },
    appUser:             { findUnique: vi.fn() },
    creditGrant:         { findMany: vi.fn() },
  },
  outbox: { enqueueEmail: vi.fn(), deliverEmail: vi.fn() },
  lifecycleMock: { findRenewalMilestones: vi.fn(), RENEWAL_MILESTONES: [-30, 0, 30, 31] },
  trialMock:     { findEndingTrials: vi.fn() },
  creditsMock:   { getCreditBalance: vi.fn() },
}))

vi.mock('@genealogiq/db', () => ({ prisma: prismaMock }))
vi.mock('./email-outbox', () => outbox)
vi.mock('server-only', () => ({}))
vi.mock('./partner-lifecycle', () => lifecycleMock)
vi.mock('./activation-trial', () => trialMock)
vi.mock('./credits', () => creditsMock)
vi.mock('./rollover', () => ({
  decideRollover: () => ({ quantity: 30, usedFounder: false, validity: 'months' }),
  countRollableCredits: async () => 70,
}))

import { runPartnerNotifications, runTrialNotifications } from './partner-notifications'

const window = (day: number) => ({
  subscriptionId: 'ps1', tenantId: 't1', daysFromEnd: day,
  endAt: new Date('2027-01-01'), graceEndAt: new Date('2027-01-31'),
})

const contract = (status = 'PAST_DUE') => ({
  id: 'ps1', tenantId: 't1', status,
  founderRolloverEligible: false, founderRolloverUsed: false,
  plan:   { name: 'Semente', annualAllowance: 100, rolloverRate: '0.300' },
  tenant: { email: 'partner@example.com', name: 'Casa', tradeName: 'Casa Funerária', isActive: true },
  currentCycle: { id: 'cyc1', startAt: new Date('2026-01-01'), endAt: new Date('2027-01-01') },
})

beforeEach(() => {
  vi.resetAllMocks()
  outbox.deliverEmail.mockResolvedValue('sent')
  prismaMock.partnerSubscription.findUnique.mockResolvedValue(contract())
  creditsMock.getCreditBalance.mockResolvedValue({ total: 70, general: 70, committed: 0, nextExpiry: null })
  lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map())
  trialMock.findEndingTrials.mockResolvedValue([])
})

describe('runPartnerNotifications', () => {
  it.each([
    [-30, 'Genealogiq — Seu plano está próximo da renovação'],
    [0,   'Genealogiq — Seu plano chegou à data de renovação'],
    [30,  'Genealogiq — O prazo para renovar seu plano está terminando'],
    [31,  'Genealogiq — O ciclo do seu plano terminou'],
  ])('sends the right notice at D%i', async (day, subject) => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[day, [window(day)]]]))
    const r = await runPartnerNotifications('https://seq.example')
    expect(r.sent).toBe(1)
    expect(outbox.enqueueEmail).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      id: `notice:cycle:cyc1:d${day}`, context: { type: 'partner-cycle', subscriptionId: 'ps1', cycleId: 'cyc1' },
      message: expect.objectContaining({ subject }),
    }))
  })

  // A send cannot be rolled back, so the claim comes first and a second run
  // loses to the unique index rather than mailing the partner twice.
  it('never sends the same notice twice', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[0, [window(0)]]]))
    prismaMock.emailOutbox.findUnique.mockResolvedValue({ sentAt: new Date(), canceledAt: null })

    const r = await runPartnerNotifications('https://seq.example')

    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(outbox.deliverEmail).not.toHaveBeenCalled()
  })

  // Otherwise a retry after a provider outage would never send that notice again.
  it('retains a failed notice for retry after the milestone day', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[0, [window(0)]]]))
    outbox.deliverEmail.mockResolvedValue('pending')

    const r = await runPartnerNotifications('https://seq.example')

    expect(r.failed).toBe(1)
    expect(outbox.enqueueEmail).toHaveBeenCalledWith(prismaMock, expect.objectContaining({ id: 'notice:cycle:cyc1:d0' }))
  })

  // Chasing a partner who already renewed would be wrong and embarrassing.
  it('does not chase a contract that already renewed', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[30, [window(30)]]]))
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(contract('ACTIVE'))

    const r = await runPartnerNotifications('https://seq.example')

    expect(r.skipped).toBe(1)
    expect(outbox.enqueueEmail).not.toHaveBeenCalled()
  })

  it('skips a partner with no email rather than throwing', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[0, [window(0)]]]))
    prismaMock.partnerSubscription.findUnique.mockResolvedValue({
      ...contract(), tenant: { email: null, name: 'X', tradeName: 'X' },
    })

    const r = await runPartnerNotifications('https://seq.example')
    expect(r.skipped).toBe(1)
  })

  it('preserves old receipts from this cycle without suppressing a later renewal year', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[0, [window(0)]]]))
    prismaMock.stripeEvent.findUnique.mockResolvedValueOnce({ createdAt: new Date('2026-12-31') })
      .mockResolvedValueOnce({ createdAt: new Date('2025-12-31') })
    expect((await runPartnerNotifications('https://seq.example')).skipped).toBe(1)
    expect((await runPartnerNotifications('https://seq.example')).sent).toBe(1)
    expect(outbox.enqueueEmail).toHaveBeenCalledOnce()
  })

  it('ignores an old cycle window when the current cycle has a different expiry', async () => {
    lifecycleMock.findRenewalMilestones.mockResolvedValue(new Map([[-30, [window(-30)]]]))
    prismaMock.partnerSubscription.findUnique.mockResolvedValue({ ...contract(), currentCycle: { id: 'cyc2', endAt: new Date('2028-01-01') } })
    expect((await runPartnerNotifications('https://seq.example')).skipped).toBe(1)
    expect(outbox.enqueueEmail).not.toHaveBeenCalled()
  })
})

describe('runTrialNotifications', () => {
  const trial = { appUserId: 'g1', tenantId: 't1', currentPeriodEnd: new Date('2027-03-01') }

  it('warns the guardian their trial is ending', async () => {
    trialMock.findEndingTrials.mockResolvedValue([trial])
    prismaMock.appUser.findUnique.mockResolvedValue({ email: 'family@example.com', firstName: 'Ana', isActive: true, role: 'APP_USER' })

    const r = await runTrialNotifications('https://app.example')

    expect(r.sent).toBe(1)
    expect(outbox.enqueueEmail).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      recipient: 'family@example.com', context: { type: 'consumer-term', appUserId: 'g1', endAt: '2027-03-01T00:00:00.000Z' },
      message: expect.objectContaining({ name: 'Ana', action: { label: 'Ver minha assinatura', url: 'https://app.example/subscriptions' } }),
    }))
  })

  it('is idempotent per guardian and end date', async () => {
    trialMock.findEndingTrials.mockResolvedValue([trial])
    prismaMock.appUser.findUnique.mockResolvedValue({ email: 'family@example.com', firstName: 'Ana', isActive: true, role: 'APP_USER' })
    prismaMock.stripeEvent.findUnique.mockResolvedValue({ id: 'legacy-receipt' })

    const r = await runTrialNotifications('https://app.example')

    expect(r.sent).toBe(0)
    expect(outbox.enqueueEmail).not.toHaveBeenCalled()
  })
})
