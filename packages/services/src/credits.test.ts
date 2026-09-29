import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    creditGrant:         { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    creditReservation:   { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    creditTransaction:   { findUnique: vi.fn(), create: vi.fn() },
    partnerSubscription: { findFirst: vi.fn() },
    $transaction:        vi.fn(),
  },
  txMock: {
    creditGrant:       { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    creditReservation: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    partnerSubscription: { findFirst: vi.fn() },
    $queryRaw:         vi.fn(),
  },
}))

vi.mock('@genealogiq/db', () => ({ prisma: prismaMock }))
vi.mock('server-only', () => ({}))

import {
  getCreditBalance,
  canActivate,
  reserveCreditForSale,
  releaseReservation,
  consumeCreditForActivation,
  InsufficientCreditsError,
} from './credits'

// Frozen against a single instant: computing it per call made the assertion
// race the clock by a millisecond.
const NOW = Date.now()
const future = (days: number) => new Date(NOW + days * 86_400_000)

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock))
  txMock.creditTransaction.findUnique.mockResolvedValue(null)
  txMock.creditTransaction.create.mockResolvedValue({ id: 'ctx_1' })
  txMock.creditReservation.findUnique.mockResolvedValue(null)
  txMock.partnerSubscription.findFirst.mockResolvedValue({ id: 'ps1' })
  prismaMock.creditGrant.findFirst.mockResolvedValue(null)
})

describe('getCreditBalance', () => {
  it('separates what can be spent freely from what is committed to a code', async () => {
    prismaMock.creditGrant.findMany.mockResolvedValue([
      { remainingQty: 30, expiresAt: future(180), source: 'ROLLOVER' },
      { remainingQty: 70, expiresAt: future(365), source: 'ANNUAL' },
      { remainingQty: 1,  expiresAt: future(400), source: 'COMMITTED' },
    ])

    const balance = await getCreditBalance('t1')

    expect(balance).toMatchObject({ total: 101, general: 100, committed: 1 })
    // The soonest deadline, which is what the partner dashboard warns about.
    expect(balance.nextExpiry).toEqual(future(180))
  })

  // Expiry is enforced on read precisely so a late or failed cron cannot let
  // anyone spend a dead credit — the query itself excludes them.
  it('asks the database for live grants only, never trusting status alone', async () => {
    prismaMock.creditGrant.findMany.mockResolvedValue([])
    await getCreditBalance('t1')

    const where = prismaMock.creditGrant.findMany.mock.calls[0][0].where
    expect(where.status).toBe('ACTIVE')
    expect(where.remainingQty).toEqual({ gt: 0 })
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }])
  })
})

describe('canActivate', () => {
  it('lets a committed code through even with no contract and no balance', async () => {
    prismaMock.creditReservation.findFirst.mockResolvedValue({ id: 'r1', grantId: 'g1', tenantId: 't1' })

    await expect(canActivate('t1', 'gc1')).resolves.toBe(true)
    // This is the promise to the family: they already paid the funeral home.
    expect(prismaMock.partnerSubscription.findFirst).not.toHaveBeenCalled()
  })

  it('refuses when the partner has no active contract', async () => {
    prismaMock.creditReservation.findFirst.mockResolvedValue(null)
    prismaMock.partnerSubscription.findFirst.mockResolvedValue(null)

    await expect(canActivate('t1', 'gc1')).resolves.toBe(false)
  })

  it('allows a live standalone package credit without an annual contract', async () => {
    prismaMock.creditReservation.findFirst.mockResolvedValue(null)
    prismaMock.partnerSubscription.findFirst.mockResolvedValue(null)
    prismaMock.creditGrant.findFirst.mockResolvedValue({ id: 'g_topup' })

    await expect(canActivate('t1', 'gc1')).resolves.toBe(true)

    expect(prismaMock.creditGrant.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        source: 'TOPUP',
        status: 'ACTIVE',
        remainingQty: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { id: true },
    })
  })

  it('refuses when the contract is active but the allowance is spent', async () => {
    prismaMock.creditReservation.findFirst.mockResolvedValue(null)
    prismaMock.partnerSubscription.findFirst.mockResolvedValue({ id: 'ps1' })
    prismaMock.creditGrant.findMany.mockResolvedValue([])

    await expect(canActivate('t1', 'gc1')).resolves.toBe(false)
  })

  // A committed unit belongs to one code; it must not keep the general pool
  // looking non-empty for everybody else.
  it('does not count committed credits as spendable by other codes', async () => {
    prismaMock.creditReservation.findFirst.mockResolvedValue(null)
    prismaMock.partnerSubscription.findFirst.mockResolvedValue({ id: 'ps1' })
    prismaMock.creditGrant.findMany.mockResolvedValue([
      { remainingQty: 1, expiresAt: future(400), source: 'COMMITTED' },
    ])

    await expect(canActivate('t1', 'gc1')).resolves.toBe(false)
  })
})

describe('reserveCreditForSale', () => {
  beforeEach(() => {
    txMock.$queryRaw.mockResolvedValue([{ id: 'g_annual', remainingQty: 50, expiresAt: future(300) }])
    txMock.creditGrant.create.mockResolvedValue({ id: 'g_committed', expiresAt: future(365) })
  })

  it('refuses when the partner has nothing left', async () => {
    txMock.$queryRaw.mockResolvedValue([])
    await expect(
      reserveCreditForSale({ tenantId: 't1', genCodeId: 'gc1', committed: false, committedMonths: 0 }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError)
  })

  it('reserves only TOPUP stock when the partner has no annual contract', async () => {
    txMock.partnerSubscription.findFirst.mockResolvedValue(null)

    await reserveCreditForSale({
      tenantId: 't1', genCodeId: 'gc1', committed: false, committedMonths: 0,
    })

    expect(txMock.$queryRaw.mock.calls[0]).toContain(true)
  })

  // A manual write-off records only a typed name. Committing it would let a
  // partner "sell" their whole stock on paper the day before a cycle ends.
  it('a manual write-off holds against the origin grant and mints no committed grant', async () => {
    await reserveCreditForSale({ tenantId: 't1', genCodeId: 'gc1', committed: false, committedMonths: 12 })

    expect(txMock.creditGrant.create).not.toHaveBeenCalled()
    expect(txMock.creditReservation.upsert.mock.calls[0][0].create.grantId).toBe('g_annual')
  })

  it('a platform sale moves the unit into a committed grant dated from the sale', async () => {
    await reserveCreditForSale({
      tenantId: 't1', genCodeId: 'gc1', committed: true, buyerId: 'b1', committedMonths: 12,
    })

    const created = txMock.creditGrant.create.mock.calls[0][0].data
    expect(created).toMatchObject({ source: 'COMMITTED', grantedQty: 1, genCodeId: 'gc1', buyerId: 'b1' })
    // Already rolled once by construction: a committed unit must never roll again.
    expect(created.rolloverGeneration).toBe(1)
    expect(txMock.creditReservation.upsert.mock.calls[0][0].create.grantId).toBe('g_committed')
  })

  it('debits the origin grant either way — the unit is spent, not duplicated', async () => {
    await reserveCreditForSale({ tenantId: 't1', genCodeId: 'gc1', committed: true, committedMonths: 12 })

    expect(txMock.creditGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g_annual' }, data: expect.objectContaining({ remainingQty: 49 }) }),
    )
  })

  it('is a no-op when the code is already reserved', async () => {
    txMock.creditReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'HELD' })
    await reserveCreditForSale({ tenantId: 't1', genCodeId: 'gc1', committed: false, committedMonths: 0 })
    expect(txMock.creditGrant.update).not.toHaveBeenCalled()
  })
})

describe('releaseReservation', () => {
  it('returns the unit when the grant is still live', async () => {
    txMock.creditReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'HELD', grantId: 'g1', tenantId: 't1' })
    txMock.creditGrant.findUnique.mockResolvedValue({
      id: 'g1', source: 'ANNUAL', remainingQty: 9, expiresAt: future(100), status: 'ACTIVE',
    })

    await releaseReservation('gc1')

    expect(txMock.creditGrant.update).toHaveBeenCalledWith({
      where: { id: 'g1' }, data: { remainingQty: { increment: 1 } },
    })
  })

  // Otherwise "undo" becomes a way around expiry.
  it('does NOT resurrect credit when the grant has already expired', async () => {
    txMock.creditReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'HELD', grantId: 'g1', tenantId: 't1' })
    txMock.creditGrant.findUnique.mockResolvedValue({
      id: 'g1', source: 'ANNUAL', remainingQty: 0, expiresAt: future(-1), status: 'ACTIVE',
    })

    await releaseReservation('gc1')

    expect(txMock.creditGrant.update).not.toHaveBeenCalled()
    expect(txMock.creditReservation.update).toHaveBeenCalledWith({
      where: { id: 'r1' }, data: { status: 'RELEASED' },
    })
  })

  // A committed grant exists for one code only; releasing it retires the grant
  // rather than handing a floating unit back to the pool.
  it('retires a committed grant instead of returning its unit to the pool', async () => {
    txMock.creditReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'HELD', grantId: 'gc', tenantId: 't1' })
    txMock.creditGrant.findUnique.mockResolvedValue({
      id: 'gc', source: 'COMMITTED', remainingQty: 1, expiresAt: future(300), status: 'ACTIVE',
    })

    await releaseReservation('gc1')

    expect(txMock.creditGrant.update).toHaveBeenCalledWith({
      where: { id: 'gc' }, data: { remainingQty: 0, status: 'EXPIRED' },
    })
  })
})

describe('consumeCreditForActivation', () => {
  it('spends the reservation’s grant when the code was sold', async () => {
    txMock.creditReservation.findUnique.mockResolvedValue({
      id: 'r1', status: 'HELD', grantId: 'g_committed', expiresAt: future(200),
    })
    txMock.$queryRaw.mockResolvedValue([{ id: 'g_committed', remainingQty: 1, expiresAt: future(200) }])

    await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    expect(txMock.creditGrant.update.mock.calls[0][0].where).toEqual({ id: 'g_committed' })
    expect(txMock.creditReservation.update).toHaveBeenCalledWith({
      where: { id: 'r1' }, data: { status: 'CONSUMED' },
    })
  })

  // A code can legitimately be activated straight out of stock, never sold.
  it('falls back to FEFO when the code carries no reservation', async () => {
    txMock.$queryRaw.mockResolvedValue([{ id: 'g_rollover', remainingQty: 5, expiresAt: future(30) }])

    await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    expect(txMock.creditGrant.update.mock.calls[0][0].where).toEqual({ id: 'g_rollover' })
    expect(txMock.creditReservation.update).not.toHaveBeenCalled()
  })

  it('spends only TOPUP credit when the partner has no annual contract', async () => {
    txMock.partnerSubscription.findFirst.mockResolvedValue(null)
    txMock.$queryRaw.mockResolvedValue([{ id: 'g_topup', remainingQty: 5, expiresAt: future(30) }])

    await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    expect(txMock.creditGrant.update.mock.calls[0][0].where).toEqual({ id: 'g_topup' })
    const queryArgs = txMock.$queryRaw.mock.calls[0]
    expect(queryArgs).toContain(true)
  })

  it('throws InsufficientCredits rather than creating a memorial nobody paid for', async () => {
    txMock.$queryRaw.mockResolvedValue([])
    await expect(
      consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError)
  })

  it('is idempotent — a replayed activation spends nothing twice', async () => {
    txMock.creditTransaction.findUnique.mockResolvedValue({ id: 'ctx_old' })

    const id = await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    expect(id).toBe('ctx_old')
    expect(txMock.creditGrant.update).not.toHaveBeenCalled()
  })

  it('marks a grant EXHAUSTED, not EXPIRED, when its last unit is spent', async () => {
    txMock.$queryRaw.mockResolvedValue([{ id: 'g1', remainingQty: 1, expiresAt: future(30) }])

    await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    expect(txMock.creditGrant.update.mock.calls[0][0].data).toMatchObject({
      remainingQty: 0, status: 'EXHAUSTED',
    })
  })

  // Skipping a locked row rather than queueing behind it means the loser of a
  // race looks at the next grant instead of waiting to find the balance gone.
  it('picks grants FEFO under a skip-locked row lock', async () => {
    txMock.$queryRaw.mockResolvedValue([{ id: 'g1', remainingQty: 2, expiresAt: future(10) }])

    await consumeCreditForActivation(txMock as never, { tenantId: 't1', genCodeId: 'gc1' })

    const sql = txMock.$queryRaw.mock.calls[0][0].join('?')
    expect(sql).toContain('ORDER BY expires_at ASC NULLS LAST')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain("source <> 'COMMITTED'")
  })
})
