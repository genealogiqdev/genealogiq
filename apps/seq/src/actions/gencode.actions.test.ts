import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    genCode: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    partnerSubscription: { findFirst: vi.fn() },
    appUser: { findUnique: vi.fn() },
    passwordResetToken: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@genealogiq/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string
      constructor(code: string) {
        super(code)
        this.code = code
      }
    },
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifyTenantSession: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendAppWelcomeEmail: vi.fn() }))
vi.mock("@genealogiq/services/email-outbox", () => ({
  enqueueEmail: vi.fn(), deliverEmail: vi.fn(), notificationUrl: (_app: string, path: string) => `https://genealogiq.com.br${path}`,
}))
// The credit ledger is the activation gate now. Stubbed permissive by default;
// the sale paths under test are about the write-off, not about the balance.
vi.mock("@genealogiq/services/credits", () => ({
  canActivate:          vi.fn(async () => true),
  reserveCreditForSale: vi.fn(async () => undefined),
  releaseReservation:   vi.fn(async () => undefined),
  InsufficientCreditsError: class extends Error {},
}))

import {
  markGenCodePrinted,
  sellGenCodeManually,
  sellGenCodeViaPlatform,
  undoGenCodeSale,
} from "./gencode.actions"
import { verifyTenantSession } from "@/lib/dal"
import { sendAppWelcomeEmail } from "@/lib/email"
import { deliverEmail, enqueueEmail } from "@genealogiq/services/email-outbox"
import { Prisma } from "@genealogiq/db"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(deliverEmail).mockResolvedValue('sent')
  vi.mocked(enqueueEmail).mockResolvedValue('receipt')
  vi.mocked(sendAppWelcomeEmail).mockResolvedValue(undefined)
  // The sale window is open by default — these tests are about the sale guards,
  // not the batch term.
  prismaMock.genCode.findUnique.mockResolvedValue({
    sale: { paidAt: new Date(), reversedAt: null, status: null, accessEndsAt: null },
  })
  vi.mocked(verifyTenantSession).mockResolvedValue({
    customerId: "c1",
    user: { id: "u1" },
  } as never)
})

describe("markGenCodePrinted — tenant-scoped ownership", () => {
  it("fails when the code is not in the caller's tenant (scoped lookup)", async () => {
    prismaMock.genCode.findFirst.mockResolvedValue(null)

    const res = await markGenCodePrinted("GEN-1", true)

    expect(res).toEqual({ ok: false, message: "gencode.notFound" })
    expect(prismaMock.genCode.findFirst).toHaveBeenCalledWith({
      where: { genCode: "GEN-1", tenantId: "c1" },
      select: { id: true },
    })
    expect(prismaMock.genCode.update).not.toHaveBeenCalled()
  })

  it("toggles the printed flag and returns ok when owned", async () => {
    prismaMock.genCode.findFirst.mockResolvedValue({ id: "lic-1" })
    prismaMock.genCode.update.mockResolvedValue({})

    const res = await markGenCodePrinted("GEN-1", true)

    expect(res.ok).toBe(true)
    expect(prismaMock.genCode.update).toHaveBeenCalledWith({
      where: { id: "lic-1" },
      data: { printedAt: expect.any(Date) },
    })
  })
})

describe("sellGenCodeManually — input validation + atomic sale guard", () => {
  it("rejects a blank buyer name before touching the DB", async () => {
    const res = await sellGenCodeManually("GEN-1", { buyerName: "   " })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.genCode.updateMany).not.toHaveBeenCalled()
  })

  it("rejects an out-of-range value before touching the DB", async () => {
    const res = await sellGenCodeManually("GEN-1", { buyerName: "Buyer", value: -5 })

    expect(res).toEqual({ ok: false, message: "gencode.invalidValue" })
    expect(prismaMock.genCode.updateMany).not.toHaveBeenCalled()
  })

  it("fails when no AVAILABLE code matches (double-sell guard, count === 0)", async () => {
    prismaMock.genCode.updateMany.mockResolvedValue({ count: 0 })

    const res = await sellGenCodeManually("GEN-1", { buyerName: "Buyer", value: 100 })

    expect(res).toEqual({ ok: false, message: "gencode.notAvailable" })
    expect(prismaMock.genCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { genCode: "GEN-1", tenantId: "c1", status: "AVAILABLE" },
      }),
    )
  })

  it("writes off an AVAILABLE code and returns ok", async () => {
    prismaMock.genCode.updateMany.mockResolvedValue({ count: 1 })

    const res = await sellGenCodeManually("GEN-1", { buyerName: "Buyer", value: 100 })

    expect(res).toEqual({ ok: true, message: "gencode.saleRecorded" })
  })
})

describe("sellGenCodeViaPlatform — sells to a bare email", () => {
  const BUYER = { firstName: "Bo", lastName: "Silva", email: "buyer@example.com" }

  // Runs the transaction callback against a stub tx, letting each test drive
  // updateMany's count and observe whether the consumer row was created.
  function mockTx(count: number) {
    const created = vi.fn().mockResolvedValue({ id: "new-user", email: BUYER.email, firstName: "Bo" })
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        appUser:            { create: created },
        genCode:  { updateMany: vi.fn().mockResolvedValue({ count }) },
        passwordResetToken: { create: vi.fn().mockResolvedValue({}) },
      }),
    )
    return created
  }

  it("rejects an invalid email before touching the database", async () => {
    const res = await sellGenCodeViaPlatform("GEN-1", { ...BUYER, email: "not-an-email" })

    expect(res.ok).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("refuses an email that already belongs to another tenant", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: "u9", tenantId: "OTHER", password: "x" })

    const res = await sellGenCodeViaPlatform("GEN-1", BUYER)

    expect(res).toEqual({ ok: false, message: "gencode.emailOtherTenant" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("creates the consumer when the email is unknown, then emails the welcome link", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue(null)
    const created = mockTx(1)

    const res = await sellGenCodeViaPlatform("GEN-1", { ...BUYER, value: 100 })

    expect(res).toEqual({ ok: true, message: "gencode.soldViaPlatform" })
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: BUYER.email, tenantId: "c1" }) }),
    )
    expect(sendAppWelcomeEmail).toHaveBeenCalledWith(BUYER.email, expect.any(String), "Bo", "/qr/GEN-1")
    expect(enqueueEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipient: BUYER.email,
      context: { type: 'gencode-sale', appUserId: 'new-user', genCode: 'GEN-1', soldAt: expect.any(String) },
      message: expect.objectContaining({ action: { label: 'Acessar GenCode', url: 'https://genealogiq.com.br/qr/GEN-1' } }),
    }))
    const receipt = vi.mocked(enqueueEmail).mock.calls[0][1]
    expect(deliverEmail).toHaveBeenCalledExactlyOnceWith(receipt.id)
    expect(JSON.stringify(receipt)).not.toContain(vi.mocked(sendAppWelcomeEmail).mock.calls[0][1])
  })

  it("reuses a password-less consumer already in the tenant instead of creating one", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "u1", email: BUYER.email, firstName: "Bo", tenantId: "c1", password: null, role: 'APP_USER', isActive: true,
    })
    const created = mockTx(1)

    const res = await sellGenCodeViaPlatform("GEN-1", BUYER)

    expect(res.ok).toBe(true)
    expect(created).not.toHaveBeenCalled()
    expect(sendAppWelcomeEmail).toHaveBeenCalled()
  })

  it("delivers the code instead of a password link when the buyer already has a password", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "u1", email: BUYER.email, firstName: "Bo", tenantId: "c1", password: "hashed", role: 'APP_USER', isActive: true,
    })
    mockTx(1)

    const res = await sellGenCodeViaPlatform("GEN-1", BUYER)

    expect(res.ok).toBe(true)
    expect(enqueueEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipient: BUYER.email, message: expect.objectContaining({ name: 'Bo', subject: 'Seu GenCode está disponível' }),
    }))
    expect(deliverEmail).toHaveBeenCalledOnce()
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
  })

  it("maps the NOT_AVAILABLE transaction throw to a localized failure", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue(null)
    mockTx(0)

    const res = await sellGenCodeViaPlatform("GEN-1", BUYER)

    expect(res).toEqual({ ok: false, message: "gencode.notAvailable" })
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(deliverEmail).not.toHaveBeenCalled()
  })

  it("maps a Prisma known request error to gencode.saleFailed", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue(null)
    prismaMock.$transaction.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as unknown as new (message: string) => Error)("P2002"),
    )

    const res = await sellGenCodeViaPlatform("GEN-1", BUYER)

    expect(res).toEqual({ ok: false, message: "gencode.saleFailed" })
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
  })

  it("keeps the sale successful while explicitly reporting the pending email", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue(null)
    mockTx(1)
    vi.mocked(sendAppWelcomeEmail).mockRejectedValue(new Error("smtp down"))

    await expect(sellGenCodeViaPlatform("GEN-1", BUYER)).resolves.toEqual({
      ok: true, message: "gencode.soldEmailPending",
    })
  })

  it('keeps an existing customer sale successful with its receipt pending for retry', async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: 'u1', email: BUYER.email, firstName: 'Bo', tenantId: 'c1', password: 'hash', role: 'APP_USER', isActive: true })
    mockTx(1)
    vi.mocked(deliverEmail).mockResolvedValue('pending')
    expect(await sellGenCodeViaPlatform('GEN-1', BUYER)).toEqual({ ok: true, message: 'gencode.soldEmailPending' })
    expect(prismaMock.$transaction).toHaveBeenCalledOnce()
    expect(enqueueEmail).toHaveBeenCalledOnce()
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
  })

  it.each([{ role: 'APP_USER', isActive: false }, { role: 'APP_MEMO', isActive: true }])('rejects an ineligible login recipient before selling: %j', async (state) => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: 'u1', tenantId: 'c1', ...state })
    expect(await sellGenCodeViaPlatform('GEN-1', BUYER)).toEqual({ ok: false, message: 'gencode.recipientUnavailable' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})

describe("undoGenCodeSale — only-while-SOLD guard", () => {
  it("fails when no SOLD code matches (already activated / never sold)", async () => {
    prismaMock.genCode.updateMany.mockResolvedValue({ count: 0 })

    const res = await undoGenCodeSale("GEN-1")

    expect(res).toEqual({ ok: false, message: "gencode.notSold" })
    expect(prismaMock.genCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { genCode: "GEN-1", tenantId: "c1", status: "SOLD" },
      }),
    )
  })

  it("reverses a SOLD code back to AVAILABLE", async () => {
    prismaMock.genCode.updateMany.mockResolvedValue({ count: 1 })

    const res = await undoGenCodeSale("GEN-1")

    expect(res).toEqual({ ok: true, message: "gencode.saleUndone" })
  })
})
