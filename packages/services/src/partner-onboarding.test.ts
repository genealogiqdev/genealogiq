import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@genealogiq/db'
import { grantInitialGenCodes } from './partner-onboarding'
vi.mock('server-only', () => ({}))

const db = { creditGrant: { create: vi.fn() }, creditTransaction: { create: vi.fn() }, genCode: { createMany: vi.fn() } }
const tx = db as unknown as Prisma.TransactionClient
const input = { tenantId: 'tenant-1', quantity: 3, createdById: 'operator-1', now: new Date('2026-10-07T12:00:00Z') }
beforeEach(() => { vi.resetAllMocks(); db.creditGrant.create.mockResolvedValue({ id: 'grant-1' }) })

describe('initial GenCodes', () => {
  it('creates three standalone credits, one audited grant and exactly three unique codes', async () => {
    await grantInitialGenCodes(tx, input)
    expect(db.creditGrant.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', source: 'TOPUP', grantedQty: 3, remainingQty: 3,
      expiresAt: new Date('2027-10-07T12:00:00Z'), rolloverGeneration: 1, createdById: 'operator-1',
      reason: 'Initial GenCodes granted during BMS partner registration',
    }, select: { id: true } })
    expect(db.creditTransaction.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', grantId: 'grant-1', type: 'GRANT', quantity: 3, balanceAfter: 3,
      idempotencyKey: 'grant:registration:tenant-1', actorId: 'operator-1',
      reason: 'Initial GenCodes granted during BMS partner registration',
    } })
    const codes = db.genCode.createMany.mock.calls[0][0].data
    expect(codes).toHaveLength(3)
    expect(new Set(codes.map((c: { genCode: string }) => c.genCode)).size).toBe(3)
    expect(codes.every((c: { tenantId: string }) => c.tenantId === 'tenant-1')).toBe(true)
    expect(codes[0]).not.toHaveProperty('mintedInOrderId')
  })
  it('zero creates no grant, ledger transaction or code', async () => {
    await grantInitialGenCodes(tx, { ...input, quantity: 0 })
    expect(db.creditGrant.create).not.toHaveBeenCalled()
    expect(db.creditTransaction.create).not.toHaveBeenCalled()
    expect(db.genCode.createMany).not.toHaveBeenCalled()
  })
  it.each([-1, 1.5, 10001])('rejects %s without a write', async (quantity) => {
    await expect(grantInitialGenCodes(tx, { ...input, quantity })).rejects.toThrow('Invalid initial GenCode quantity')
    expect(db.creditGrant.create).not.toHaveBeenCalled()
  })
})
