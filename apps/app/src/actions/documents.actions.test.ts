import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    document: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))

import { saveDocument, deleteDocument } from "./documents.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { getMemorialFeatures } from "@/lib/subscription"
import { deleteBlobs } from "@/lib/blob"

const validData = {
  title: "Birth certificate",
  description: "",
  category: "birth_certificate",
  fileUrl: "https://qa.public.blob.vercel-storage.com/doc.pdf",
  fileName: "doc.pdf",
  isPublic: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ documentsMax: 3 } as never)
  prismaMock.document.count.mockResolvedValue(0)
})

describe("saveDocument — guards", () => {
  it("rejects when the profile does not exist", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)
    const res = await saveDocument("A", null, validData)
    expect(res).toEqual({ ok: false, message: "documents.notAuthorized" })
    expect(prismaMock.document.create).not.toHaveBeenCalled()
  })

  it("rejects a caller who cannot manage the profile", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)
    const res = await saveDocument("A", null, validData)
    expect(res).toEqual({ ok: false, message: "documents.notAuthorized" })
    expect(prismaMock.document.create).not.toHaveBeenCalled()
  })

  it("rejects invalid input before writing", async () => {
    const res = await saveDocument("A", null, { ...validData, category: "nope" })
    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.document.create).not.toHaveBeenCalled()
  })
})

describe("saveDocument — quota (always enforced)", () => {
  it("blocks creation at/over the limit", async () => {
    prismaMock.document.count.mockResolvedValue(3)
    const res = await saveDocument("A", null, validData)
    expect(res).toEqual({ ok: false, message: "documents.limitReached" })
    expect(prismaMock.document.create).not.toHaveBeenCalled()
  })

  it("allows creation under the limit", async () => {
    prismaMock.document.count.mockResolvedValue(2)
    prismaMock.document.create.mockResolvedValue({ id: "d1" })
    const res = await saveDocument("A", null, validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.document.create).toHaveBeenCalled()
  })
})

describe("saveDocument — create/update happy paths", () => {
  it("creates a document with order equal to the current count", async () => {
    prismaMock.document.count.mockResolvedValue(2)
    prismaMock.document.create.mockResolvedValue({ id: "d1" })
    const res = await saveDocument("A", null, validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "A", order: 2 }) }),
    )
  })

  it("fails to update a document that does not belong to the profile", async () => {
    prismaMock.document.findFirst.mockResolvedValue(null)
    const res = await saveDocument("A", "missing", validData)
    expect(res).toEqual({ ok: false, message: "documents.notFound" })
    expect(prismaMock.document.update).not.toHaveBeenCalled()
  })

  it("updates an existing document without touching the blob when the file is unchanged", async () => {
    prismaMock.document.findFirst.mockResolvedValue({ fileUrl: validData.fileUrl })
    prismaMock.document.update.mockResolvedValue({ id: "d1" })
    const res = await saveDocument("A", "d1", validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).not.toHaveBeenCalled()
    expect(prismaMock.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1" } }),
    )
  })

  it("updates an existing document and prunes the stale file blob when the file changed", async () => {
    prismaMock.document.findFirst.mockResolvedValue({
      fileUrl: "https://qa.public.blob.vercel-storage.com/old.pdf",
    })
    prismaMock.document.update.mockResolvedValue({ id: "d1" })
    const res = await saveDocument("A", "d1", validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/old.pdf"])
    expect(prismaMock.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1" } }),
    )
  })
})

describe("deleteDocument", () => {
  it("rejects a caller who cannot manage the profile", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)
    const res = await deleteDocument("A", "d1")
    expect(res).toEqual({ ok: false, message: "documents.notAuthorized" })
    expect(prismaMock.document.delete).not.toHaveBeenCalled()
  })

  it("deletes the document and its blob on the happy path", async () => {
    prismaMock.document.findFirst.mockResolvedValue({
      fileUrl: "https://qa.public.blob.vercel-storage.com/x.pdf",
    })
    prismaMock.document.delete.mockResolvedValue({})
    const res = await deleteDocument("A", "d1")
    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/x.pdf"])
    expect(prismaMock.document.delete).toHaveBeenCalledWith({ where: { id: "d1" } })
  })
})
