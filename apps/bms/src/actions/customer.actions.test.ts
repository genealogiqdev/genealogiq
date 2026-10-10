import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, PrismaKnownError } = vi.hoisted(() => {
  class PrismaKnownError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
  const prismaMock = {
    partnerSubscription: { count: vi.fn() },
    genCodeOrder: { count: vi.fn() },
    appUser: { count: vi.fn() },
    appSale: { count: vi.fn() },
    tenant:  { delete: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    creditGrant: { count: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prismaMock, PrismaKnownError }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  // The locale picks the currency, so every action that touches money reads it.
  getLocale: vi.fn(async () => "en-US"),
}))
vi.mock("@genealogiq/db", () => ({ Prisma: { PrismaClientKnownRequestError: PrismaKnownError } }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifyAdmin: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendSequoiaWelcomeEmail: vi.fn(), sendPartnerCredentialsEmail: vi.fn() }))
vi.mock('@genealogiq/services/partner-onboarding', () => ({ grantInitialGenCodes: vi.fn() }))
vi.mock("@genealogiq/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@genealogiq/core")>()),
  hashToken: vi.fn((t: string) => `hashed:${t}`),
  done: (message?: string) => ({ ok: true, message }),
  fail: (message: string) => ({ ok: false, message }),
}))

import { createCustomer, deleteCustomer, resendCustomerEmail } from "./customer.actions"
import { verifyAdmin } from '@/lib/dal'
import { sendPartnerCredentialsEmail, sendSequoiaWelcomeEmail } from '@/lib/email'
import { grantInitialGenCodes } from '@genealogiq/services/partner-onboarding'
import { customerCreateDefaultValues } from '@/schemas/customer.schema'
import bcrypt from 'bcryptjs'

const input = { ...customerCreateDefaultValues, name: 'Fixture Funeral', tradeName: 'Fixture Funeral',
  taxId: '11.222.333/0001-81', email: 'business@genealogiq.test', phone: '11955550100', initialGenCodes: 3,
  owner: { firstName: 'Fixture', lastName: 'Owner', email: 'owner@genealogiq.test' } }

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.partnerSubscription.count.mockResolvedValue(0)
  prismaMock.genCodeOrder.count.mockResolvedValue(0)
  prismaMock.appUser.count.mockResolvedValue(0)
  prismaMock.appSale.count.mockResolvedValue(0)
  prismaMock.creditGrant.count.mockResolvedValue(0)
  vi.mocked(verifyAdmin).mockResolvedValue({ user: { id: 'operator-1' } } as Awaited<ReturnType<typeof verifyAdmin>>)
  prismaMock.tenant.create.mockResolvedValue({ id: 'tenant-new' })
  prismaMock.user.create.mockResolvedValue({ id: 'owner-new' })
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
})

// A Tenant cascade-deletes its AppUser memorials + AppSale subscription rows
// (schema.prisma onDelete: Cascade). The old guard only counted the SEQ Sale
// table, so deleting a funeral home with SEQ-provisioned memorials but no Sale
// rows silently destroyed paid end-user content. These guard against that.
describe("deleteCustomer — cross-app cascade guard", () => {
  it("refuses when the tenant has SEQ-provisioned APP memorials (AppUser) and never deletes", async () => {
    prismaMock.appUser.count.mockResolvedValue(3)

    const res = await deleteCustomer("t1")

    expect(res).toEqual({ ok: false, message: "customer.hasAppData" })
    expect(prismaMock.tenant.delete).not.toHaveBeenCalled()
  })

  it("refuses when the tenant has APP subscription rows (AppSale) and never deletes", async () => {
    prismaMock.appSale.count.mockResolvedValue(1)

    const res = await deleteCustomer("t1")

    expect(res).toEqual({ ok: false, message: "customer.hasAppData" })
    expect(prismaMock.tenant.delete).not.toHaveBeenCalled()
  })

  it("still refuses on existing partner contracts (original guard preserved)", async () => {
    prismaMock.partnerSubscription.count.mockResolvedValue(2)

    const res = await deleteCustomer("t1")

    expect(res).toEqual({ ok: false, message: "customer.hasSales" })
    expect(prismaMock.tenant.delete).not.toHaveBeenCalled()
  })

  it("refuses when the tenant has GenCode package orders", async () => {
    prismaMock.genCodeOrder.count.mockResolvedValue(1)

    const res = await deleteCustomer("t1")

    expect(res).toEqual({ ok: false, message: "customer.hasSales" })
    expect(prismaMock.tenant.delete).not.toHaveBeenCalled()
  })

  it("deletes when the tenant has no contracts, memorials, or subscriptions", async () => {
    prismaMock.tenant.delete.mockResolvedValue({ id: "t1" })

    const res = await deleteCustomer("t1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.tenant.delete).toHaveBeenCalledWith({ where: { id: "t1" } })
  })
  it('preserves a registration credit ledger even without a purchase', async () => {
    prismaMock.creditGrant.count.mockResolvedValue(1)
    expect(await deleteCustomer('t1')).toEqual({ ok: false, message: 'customer.hasCredits' })
    expect(prismaMock.tenant.delete).not.toHaveBeenCalled()
  })
})

describe('immediate partner onboarding', () => {
  it('rejects the final-consumer segment instead of creating Sequoia staff or credits', async () => {
    const result = await createCustomer({ ...input, businessSegment: 'FINAL_CONSUMER' } as unknown as typeof input)
    expect(result).toEqual({ ok: false, message: 'common.invalidData' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.tenant.create).not.toHaveBeenCalled()
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(grantInitialGenCodes).not.toHaveBeenCalled()
    expect(sendPartnerCredentialsEmail).not.toHaveBeenCalled()
  })

  it('persists an active owner with a matching password hash and grants the exact allowance before email', async () => {
    const result = await createCustomer(input)
    expect(result).toEqual({ ok: true, data: { id: 'tenant-new', emailPending: false }, message: 'customer.createdWithAccess' })
    const [to, password, count] = vi.mocked(sendPartnerCredentialsEmail).mock.calls[0]
    expect(to).toBe('owner@genealogiq.test')
    expect(count).toBe(3)
    expect(password).toMatch(/^Gq![A-Za-z0-9_-]{24}$/)
    const owner = prismaMock.user.create.mock.calls[0][0].data
    expect(owner).toMatchObject({ role: 'OWNER', tenantId: 'tenant-new', isActive: true, email: to })
    expect(await bcrypt.compare(password, owner.password)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(password)
    expect(prismaMock.tenant.create.mock.calls[0][0].data).not.toHaveProperty('initialGenCodes')
    expect(grantInitialGenCodes).toHaveBeenCalledWith(prismaMock, { tenantId: 'tenant-new', quantity: 3, createdById: 'operator-1' })
    expect(vi.mocked(grantInitialGenCodes).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendPartnerCredentialsEmail).mock.invocationCallOrder[0])
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
  })

  it('permits zero codes and still sends access credentials', async () => {
    expect((await createCustomer({ ...input, initialGenCodes: 0 })).ok).toBe(true)
    expect(grantInitialGenCodes).toHaveBeenCalledWith(prismaMock, expect.objectContaining({ quantity: 0 }))
    expect(sendPartnerCredentialsEmail).toHaveBeenCalledWith('owner@genealogiq.test', expect.any(String), 0)
  })

  it.each([-1, 0.5, 10001, Number.NaN, Infinity])('rejects invalid quantity %s before any write or email', async (initialGenCodes) => {
    expect(await createCustomer({ ...input, initialGenCodes })).toEqual({ ok: false, message: 'common.invalidData' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(sendPartnerCredentialsEmail).not.toHaveBeenCalled()
  })

  it('rejects an unauthorized operator before reading or writing a tenant', async () => {
    vi.mocked(verifyAdmin).mockRejectedValue(new Error('Forbidden'))
    await expect(createCustomer(input)).rejects.toThrow('Forbidden')
    expect(prismaMock.tenant.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a duplicate registration without a second grant', async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({ id: 'tenant-existing' })
    expect(await createCustomer(input)).toEqual({ ok: false, message: 'customer.taxIdExists' })
    expect(grantInitialGenCodes).not.toHaveBeenCalled()
    expect(sendPartnerCredentialsEmail).not.toHaveBeenCalled()
  })

  it('sends no credentials when the transaction fails', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('Write failed'))
    await expect(createCustomer(input)).rejects.toThrow('Write failed')
    expect(sendPartnerCredentialsEmail).not.toHaveBeenCalled()
  })

  it('reports committed registration separately from failed email delivery', async () => {
    vi.mocked(sendPartnerCredentialsEmail).mockRejectedValue(new Error('Rejected'))
    expect(await createCustomer(input)).toEqual({ ok: true, data: { id: 'tenant-new', emailPending: true }, message: 'customer.createdEmailPending' })
    expect(grantInitialGenCodes).toHaveBeenCalledTimes(1)
  })

  it('recovers an active owner through a setup link without overwriting their password or granting codes', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'owner-new', email: input.owner.email, isActive: true })
    expect((await resendCustomerEmail('tenant-new')).ok).toBe(true)
    expect(sendSequoiaWelcomeEmail).toHaveBeenCalledWith(input.owner.email, expect.any(String))
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(grantInitialGenCodes).not.toHaveBeenCalled()
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1)
  })

  it('keeps inactive legacy owners blocked during resend', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'legacy', isActive: false })
    expect(await resendCustomerEmail('legacy')).toEqual({ ok: false, message: 'customer.accessNotProvisioned' })
    expect(sendSequoiaWelcomeEmail).not.toHaveBeenCalled()
  })
})
