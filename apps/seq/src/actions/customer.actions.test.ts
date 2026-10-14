import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AppUserFormValues } from "@/schemas/app-user.schema"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appUser:         { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    passwordResetToken: { create: vi.fn(), deleteMany: vi.fn() },
    appSale:         { count: vi.fn() },
    appUserGuardian: { count: vi.fn() },
    $transaction:    vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => 'pt-BR' }))
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
vi.mock('@/lib/customer-access', () => ({ verifyCustomerAccessAdmin: vi.fn() }))
vi.mock('@genealogiq/services/partner-consumer-access', async (original) => ({
  ...await original<typeof import('@genealogiq/services/partner-consumer-access')>(), recordCustomerGenCodeSale: vi.fn(),
}))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: vi.fn() }))

import { createCustomer, updateCustomer, deleteCustomer, resendCustomerEmail } from "./customer.actions"
import { sendAppWelcomeEmail } from '@/lib/email'
import { hashToken } from '@genealogiq/core'
import { verifyTenantSession } from "@/lib/dal"
import { Prisma } from "@genealogiq/db"
import { verifyCustomerAccessAdmin } from '@/lib/customer-access'
import { recordCustomerGenCodeSale } from '@genealogiq/services/partner-consumer-access'
import { InsufficientCreditsError } from '@genealogiq/services/credits'

// A valid AppUserFormValues — satisfies every required field in getAppUserSchema.
const validUser: AppUserFormValues = {
  firstName:        "Ada",
  lastName:         "Lovelace",
  gender:           null,
  birthDate:        "1990-01-01",
  birthCity:        "",
  birthState:       "",
  birthCountry:     "BR",
  email:            "ada@example.com",
  phoneCountryCode: "55",
  phone:            "11999999999",
  categoryId:       null,
  notes:            null,
  isActive:         true,
  fb:               null,
  instagram:        null,
  linkedin:         null,
  tiktok:           null,
  x:                null,
  youtube:          null,
  otherSocial:      null,
  website:          null,
  address:          undefined,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyTenantSession).mockResolvedValue({ customerId: "c1" } as never)
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
})

describe("createCustomer", () => {
  it("rejects invalid input before touching the DB", async () => {
    const res = await createCustomer({ ...validUser, email: "not-an-email" })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.create).not.toHaveBeenCalled()
  })

  it("maps a duplicate-email P2002 to customer.emailExists", async () => {
    prismaMock.appUser.create.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as unknown as new (message: string) => Error)("P2002"),
    )

    const res = await createCustomer(validUser)

    expect(res).toEqual({ ok: false, message: "customer.emailExists" })
  })

  it("rethrows non-Prisma / non-P2002 errors instead of swallowing them", async () => {
    prismaMock.appUser.create.mockRejectedValue(new Error("connection lost"))

    await expect(createCustomer(validUser)).rejects.toThrow("connection lost")
  })

  it("returns a success ActionResult on the happy path, tenant-scoped", async () => {
    prismaMock.appUser.create.mockResolvedValue({ id: "u1" })

    const res = await createCustomer(validUser)

    expect(res).toEqual({ ok: true, message: "customer.created" })
    expect(prismaMock.appUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant: { connect: { id: "c1" } },
        }),
      }),
    )
    const token = vi.mocked(sendAppWelcomeEmail).mock.calls[0][1]
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({ data: {
      token: hashToken(token), appUserId: 'u1', expiresAt: expect.any(Date),
    } })
    expect(sendAppWelcomeEmail).toHaveBeenCalledExactlyOnceWith('ada@example.com', token, 'Ada')
  })

  it('preserves registration and explains how to recover a failed invitation', async () => {
    prismaMock.appUser.create.mockResolvedValue({ id: 'u1' })
    vi.mocked(sendAppWelcomeEmail).mockRejectedValue(new Error('provider rejected'))
    expect(await createCustomer(validUser)).toEqual({ ok: true, message: 'customer.createdEmailPending' })
    expect(prismaMock.appUser.create).toHaveBeenCalledOnce()
  })

  it('does not invite an inactive account', async () => {
    prismaMock.appUser.create.mockResolvedValue({ id: 'u1' })
    expect(await createCustomer({ ...validUser, isActive: false })).toEqual({ ok: true, message: 'customer.created' })
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
  })

  it('does not send an invitation when its token transaction fails', async () => {
    prismaMock.appUser.create.mockResolvedValue({ id: 'u1' })
    prismaMock.passwordResetToken.create.mockRejectedValue(new Error('token write failed'))
    await expect(createCustomer(validUser)).rejects.toThrow('token write failed')
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
  })
})

describe('customer registration with a GenCode and Premium', () => {
  const options = { mode: 'gencode-premium' as const, requestId: '12eb1a15-9991-410a-b4dc-cba66bb57422', genCode: '' }
  beforeEach(() => {
    prismaMock.appUser.create.mockResolvedValue({ id: 'u1' })
    vi.mocked(verifyCustomerAccessAdmin).mockResolvedValue({ customerId: 'c1', user: { id: 'operator-1' } } as never)
    vi.mocked(recordCustomerGenCodeSale).mockResolvedValue({ genCode: 'AAAA-BBBB-CCCC-DDDD', emailId: null, alreadySold: false })
  })
  it('keeps simple registration independent of inventory', async () => {
    expect((await createCustomer(validUser)).ok).toBe(true)
    expect(recordCustomerGenCodeSale).not.toHaveBeenCalled()
  })
  it('passes the same transaction, verified tenant and new customer to the sale and deep-links the invitation', async () => {
    expect(await createCustomer(validUser, options)).toEqual({ ok: true, message: 'registered' })
    expect(recordCustomerGenCodeSale).toHaveBeenCalledWith(prismaMock, { ...options, tenantId: 'c1', appUserId: 'u1', actorId: 'operator-1', currency: 'BRL' })
    expect(sendAppWelcomeEmail).toHaveBeenCalledWith('ada@example.com', expect.any(String), 'Ada', '/qr/AAAA-BBBB-CCCC-DDDD')
  })
  it('rejects a non-admin before customer creation or sale', async () => {
    vi.mocked(verifyCustomerAccessAdmin).mockRejectedValue(new Error('FORBIDDEN'))
    await expect(createCustomer(validUser, options)).rejects.toThrow('FORBIDDEN')
    expect(prismaMock.appUser.create).not.toHaveBeenCalled(); expect(recordCustomerGenCodeSale).not.toHaveBeenCalled()
  })
  it('returns the credit boundary without sending a welcome email after transaction failure', async () => {
    vi.mocked(recordCustomerGenCodeSale).mockRejectedValue(new InsufficientCreditsError('c1'))
    expect(await createCustomer(validUser, options)).toEqual({ ok: false, message: 'errors.no-credit' })
    expect(sendAppWelcomeEmail).not.toHaveBeenCalled()
  })
  it('reports completed Premium registration when invitation delivery fails', async () => {
    vi.mocked(sendAppWelcomeEmail).mockRejectedValue(new Error('mail unavailable'))
    expect(await createCustomer(validUser, options)).toEqual({ ok: true, message: 'registeredEmailPending' })
    expect(recordCustomerGenCodeSale).toHaveBeenCalledOnce()
  })
})

describe('resendCustomerEmail', () => {
  it('rejects a different tenant and an inactive account before issuing a link', async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'u1', email: 'ada@example.com', isActive: false })
    expect(await resendCustomerEmail('u1')).toEqual({ ok: false, message: 'customer.notFound' })
    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1', tenantId: 'c1' } }))
    expect(await resendCustomerEmail('u1')).toEqual({ ok: false, message: 'customer.inactiveEmail' })
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
  })

  it('reports a provider failure without another customer creation', async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: 'u1', email: 'ada@example.com', firstName: 'Ada', isActive: true, password: null })
    vi.mocked(sendAppWelcomeEmail).mockRejectedValue(new Error('unavailable'))
    expect(await resendCustomerEmail('u1')).toEqual({ ok: false, message: 'customer.emailPending' })
    expect(prismaMock.appUser.create).not.toHaveBeenCalled()
  })
})

describe("updateCustomer", () => {
  it("rejects invalid input before touching the DB", async () => {
    const res = await updateCustomer("u1", { ...validUser, firstName: "" })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("maps a missing record P2025 to customer.notFound", async () => {
    prismaMock.appUser.update.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as unknown as new (message: string) => Error)("P2025"),
    )

    const res = await updateCustomer("missing", validUser)

    expect(res).toEqual({ ok: false, message: "customer.notFound" })
    expect(prismaMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "missing", tenantId: "c1" } }),
    )
  })
})

describe("deleteCustomer", () => {
  it("blocks deletion when the customer still has sales, before any transaction", async () => {
    prismaMock.appSale.count.mockResolvedValue(2)

    const res = await deleteCustomer("u1")

    expect(res).toEqual({ ok: false, message: "customer.hasSales" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("blocks deletion of a sole guardian of a memorial", async () => {
    prismaMock.appSale.count.mockResolvedValue(0)
    prismaMock.appUserGuardian.count.mockResolvedValue(1)

    const res = await deleteCustomer("u1")

    expect(res).toEqual({ ok: false, message: "customer.soleGuardian" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("returns a bare success when all guards pass", async () => {
    prismaMock.appSale.count.mockResolvedValue(0)
    prismaMock.appUserGuardian.count.mockResolvedValue(0)
    prismaMock.$transaction.mockResolvedValue(undefined)

    const res = await deleteCustomer("u1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it("maps an unknown Prisma error code to customer.deleteFailed", async () => {
    prismaMock.appSale.count.mockResolvedValue(0)
    prismaMock.appUserGuardian.count.mockResolvedValue(0)
    prismaMock.$transaction.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as unknown as new (message: string) => Error)("P2003"),
    )

    const res = await deleteCustomer("u1")

    expect(res).toEqual({ ok: false, message: "customer.deleteFailed" })
  })
})
