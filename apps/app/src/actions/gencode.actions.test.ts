import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, txMock, safeParseMock } = vi.hoisted(() => ({
  prismaMock: {
    genCode: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  txMock: {
    appUser: { create: vi.fn() },
    appUserGuardian: { create: vi.fn() },
    genCode: { update: vi.fn(), findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
  safeParseMock: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
// Activation now spends a credit inside the same transaction that creates the
// memorial. Permissive by default; the insufficient-balance path has its own test.
const { creditsMock } = vi.hoisted(() => ({
  creditsMock: {
    canActivate:                vi.fn(async () => true),
    consumeCreditForActivation: vi.fn(async () => "ctx_1"),
    InsufficientCreditsError:   class extends Error {},
  },
}))
const { activationTrialMock } = vi.hoisted(() => ({ activationTrialMock: vi.fn() }))
const { claimMock } = vi.hoisted(() => ({ claimMock: vi.fn() }))
vi.mock('@genealogiq/services/reseller-activation', () => ({ claimResellerCode: claimMock, ResellerActivationError: class extends Error { constructor(public reason: string) { super(reason) } } }))
vi.mock("@genealogiq/services/credits", () => creditsMock)
vi.mock("@genealogiq/services/activation-trial", () => ({
  grantActivationTrial: activationTrialMock,
}))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))
// The action localizes its business messages via getTranslations('Actions').
// Stub it to echo the key so assertions can pin the exact message source.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'pt-BR',
}))
// The action calls getMemorialSchema(identityTranslator).safeParse(data); stub the
// factory so it always hands back an object whose safeParse we control per-test.
vi.mock("@/schemas/memorial.schema", () => ({ getMemorialSchema: () => ({ safeParse: safeParseMock }) }))

import { activateGenCode } from "./gencode.actions"
import { verifySession } from "@/lib/dal"
import { ResellerActivationError } from '@genealogiq/services/reseller-activation'

const MEMORIAL = { firstName: "Ana", lastName: "Silva" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "guardian-1" } } as never)
  safeParseMock.mockReturnValue({ success: true, data: MEMORIAL })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock))
  txMock.appUser.create.mockResolvedValue({ id: "memo-1" })
  txMock.appUserGuardian.create.mockResolvedValue({})
  txMock.genCode.update.mockResolvedValue({})
  activationTrialMock.mockResolvedValue({ granted: true })
  claimMock.mockResolvedValue(undefined)
})

// A paid, non-reversed sale with no term and no subscription — the window is
// open, so these tests stay about activation rather than the batch's shelf life.
const OPEN_SALE = { paidAt: new Date(), reversedAt: null, status: null, accessEndsAt: null }

describe("activateGenCode", () => {
  it('rejects a reseller code assigned to another buyer', async () => {
    for (const soldToAppUserId of ['other-buyer']) {
      prismaMock.genCode.findUnique.mockResolvedValue({ id: 'lic-1', status: 'SOLD', businessSaleId: 'b2b-sale', soldToAppUserId })
      expect(await activateGenCode('GENCODE', MEMORIAL)).toEqual({ ok: false, message: 'gencode.resellerRecipient' })
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
  it('rechecks reseller recipient and activation after taking the row lock', async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: 'lic-1', status: 'SOLD', businessSaleId: 'b2b-sale', soldToAppUserId: 'guardian-1' })
    claimMock.mockRejectedValue(new ResellerActivationError('activated'))
    expect(await activateGenCode('GENCODE', MEMORIAL)).toEqual({ ok: false, message: 'gencode.alreadyActivated' })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
    claimMock.mockRejectedValue(new ResellerActivationError('recipient'))
    expect(await activateGenCode('GENCODE', MEMORIAL)).toEqual({ ok: false, message: 'gencode.resellerRecipient' })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })
  it('lets the named reseller buyer activate with the existing reserved credit', async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: 'lic-1', tenantId: 'tenant-1', status: 'SOLD', businessSaleId: 'b2b-sale', soldToAppUserId: 'guardian-1' })
    txMock.genCode.findUnique.mockResolvedValue({ status: 'SOLD', businessSaleId: 'b2b-sale', soldToAppUserId: 'guardian-1' })
    expect(await activateGenCode('GENCODE', MEMORIAL)).toEqual({ ok: true, data: { id: 'memo-1' } })
    expect(claimMock).toHaveBeenCalledWith(txMock, { genCodeId: 'lic-1', tenantId: 'tenant-1', buyerId: 'guardian-1', currency: 'BRL' })
    expect(creditsMock.consumeCreditForActivation).toHaveBeenCalledWith(txMock, { tenantId: 'tenant-1', genCodeId: 'lic-1' })
  })
  it('lets an unassigned reseller code be claimed by the signed-in end customer inside activation', async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: 'lic-1', tenantId: 'tenant-1', status: 'SOLD', businessSaleId: 'b2b-sale', soldToAppUserId: null })
    expect(await activateGenCode('GENCODE', MEMORIAL)).toEqual({ ok: true, data: { id: 'memo-1' } })
    expect(claimMock).toHaveBeenCalledWith(txMock, { genCodeId: 'lic-1', tenantId: 'tenant-1', buyerId: 'guardian-1', currency: 'BRL' })
  })
  it("rejects an unknown gen code", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue(null)
    expect(await activateGenCode("NOPE", MEMORIAL)).toEqual({ ok: false, message: "gencode.notFound" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("rejects a code that is no longer AVAILABLE (double-activation guard)", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: "lic-1", status: "ACTIVATED", sale: OPEN_SALE })
    expect(await activateGenCode("GENCODE", MEMORIAL)).toEqual({
      ok: false,
      message: "gencode.alreadyActivated",
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("rejects invalid memorial data before mutating", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: "lic-1", status: "AVAILABLE", sale: OPEN_SALE })
    safeParseMock.mockReturnValue({ success: false, error: { issues: [{ message: "First name required" }] } })
    expect(await activateGenCode("GENCODE", MEMORIAL)).toEqual({ ok: false, message: "First name required" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("activates: creates the memorial + guardian link and marks the license ACTIVATED", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: "lic-1", status: "AVAILABLE", sale: OPEN_SALE })

    const res = await activateGenCode("GENCODE", MEMORIAL)

    expect(res).toEqual({ ok: true, data: { id: "memo-1" }, message: undefined })
    expect(txMock.appUserGuardian.create).toHaveBeenCalledWith({
      data: { appUserId: "memo-1", guardianId: "guardian-1" },
    })
    expect(txMock.genCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lic-1" },
        data: expect.objectContaining({ status: "ACTIVATED", appUserId: "memo-1" }),
      }),
    )
  })

  it("grants the package's snapshotted Premium benefit for 12 months", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({
      id: "lic-1",
      status: "AVAILABLE",
      tenantId: "tenant-1",
      mintedInOrder: {
        activationTrialMonths: 12,
        activationTrialPlanCode: "PREMIUM",
      },
      mintedInCycle: null,
      tenant: { partnerSubscriptions: [] },
    })

    await activateGenCode("GENCODE", MEMORIAL)

    expect(activationTrialMock).toHaveBeenCalledWith(txMock, {
      guardianId: "guardian-1",
      tenantId: "tenant-1",
      months: 12,
      planCode: "PREMIUM",
    })
  })

  it("uses the annual cycle snapshot after the originating contract becomes inactive", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({
      id: "lic-1",
      status: "AVAILABLE",
      tenantId: "tenant-1",
      mintedInOrder: null,
      mintedInCycle: {
        planSnapshot: {
          activationTrialMonths: 12,
          activationTrialPlanCode: "PREMIUM",
        },
      },
      tenant: { partnerSubscriptions: [] },
    })

    await activateGenCode("GENCODE", MEMORIAL)

    expect(activationTrialMock).toHaveBeenCalledWith(txMock, expect.objectContaining({
      months: 12,
      planCode: "PREMIUM",
    }))
  })

  // The window gates ACTIVATION ONLY. These four cases are the whole product
  // decision: unused stock has a shelf life and freezes with the tenant's
  // billing, while a memorial that already redeemed a code is never revisited.


  it("accepts once the tenant is paying again — same row, no intervention", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({
      id: "lic-1", status: "AVAILABLE",
      sale: { ...OPEN_SALE, status: "active", accessEndsAt: new Date(Date.now() + 60_000) },
    })

    const res = await activateGenCode("GENCODE", MEMORIAL)

    expect(res.ok).toBe(true)
  })

  // An already-ACTIVATED code short-circuits before the window is consulted, so
  // a lapsed tenant can never take a memorial down. The family bought a plaque.
  it("reports an already-activated code as such, never as expired", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({
      id: "lic-1", status: "ACTIVATED",
      sale: { ...OPEN_SALE, status: "canceled", accessEndsAt: new Date(Date.now() - 60_000) },
    })

    const res = await activateGenCode("GENCODE", MEMORIAL)

    expect(res).toEqual({ ok: false, message: "gencode.alreadyActivated" })
  })

  it("handles the activation race: a concurrent winner (P2002) yields a friendly retry error", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: "lic-1", status: "AVAILABLE", sale: OPEN_SALE })
    prismaMock.$transaction.mockRejectedValue({ code: "P2002" })

    expect(await activateGenCode("GENCODE", MEMORIAL)).toEqual({
      ok: false,
      message: "gencode.raceRetry",
    })
  })

  // Replaces the two old window tests. The reason a code can be refused moved
  // from "the originating sale's term ended" to "the partner has no credit" —
  // which is the whole point of decoupling the code from the sale.
  it("refuses a code the partner has no credit for", async () => {
    prismaMock.genCode.findUnique.mockResolvedValue({ id: "l1", status: "AVAILABLE", tenantId: "t1" })
    creditsMock.canActivate.mockResolvedValueOnce(false)

    const result = await activateGenCode("CODE", {})

    expect(result.ok).toBe(false)
    expect(result.message).toBe("gencode.expired")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
