import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  processMediaUpload,
  readMediaUploadBody,
  deleteUnreferencedMediaUrls,
  isAzureMediaUrlInPrefix,
  prismaMock,
} = vi.hoisted(() => ({
  processMediaUpload: vi.fn(),
  readMediaUploadBody: vi.fn(),
  deleteUnreferencedMediaUrls: vi.fn(),
  isAzureMediaUrlInPrefix: vi.fn(),
  prismaMock: { appUser: { findUnique: vi.fn() } },
}))

vi.mock("@genealogiq/services/media-storage", () => ({
  processMediaUpload,
  readMediaUploadBody,
  deleteUnreferencedMediaUrls,
  isAzureMediaUrlInPrefix,
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
}))

import { DELETE, POST } from "./route"
import { auth } from "@/auth"
import { canManageProfile } from "@/lib/profile"

const request = () => new Request("http://localhost/api/bio/upload", { method: "POST" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: "actor" } } as never)
  vi.mocked(processMediaUpload).mockResolvedValue({
    url: "https://storage.blob.core.windows.net/media/pending/avatar.jpg",
  } as never)
})

describe("POST /api/bio/upload", () => {
  it("rejects anonymous upload requests", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    readMediaUploadBody.mockResolvedValue({
      type: "media.upload.authorize",
      file: { name: "avatar.jpg", type: "image/jpeg", size: 100 },
      clientPayload: JSON.stringify({ scope: "create-ghost" }),
    })

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(processMediaUpload).not.toHaveBeenCalled()
  })

  it("authorizes a tree-created person under the actor's pending prefix", async () => {
    const body = {
      type: "media.upload.authorize" as const,
      file: { name: "avatar.jpg", type: "image/jpeg", size: 100 },
      clientPayload: JSON.stringify({ scope: "create-ghost" }),
    }
    readMediaUploadBody.mockResolvedValue(body)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(processMediaUpload).toHaveBeenCalledWith(
      body,
      expect.objectContaining({
        prefix: "pending/actor/create-ghost",
        maximumSizeInBytes: 10 * 1024 * 1024,
        container: "staging",
      }),
    )
  })

  it("rejects an existing profile the actor cannot manage", async () => {
    readMediaUploadBody.mockResolvedValue({
      type: "media.upload.authorize",
      file: { name: "avatar.jpg", type: "image/jpeg", size: 100 },
      clientPayload: JSON.stringify({ profileId: "profile-1" }),
    })
    prismaMock.appUser.findUnique.mockResolvedValue({ id: "profile-1", guardedBy: [] })
    vi.mocked(canManageProfile).mockReturnValue(false)

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(processMediaUpload).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/bio/upload", () => {
  it("removes an unclaimed upload only from the actor's authorized prefix", async () => {
    isAzureMediaUrlInPrefix.mockReturnValue(true)
    const url = "https://storage.blob.core.windows.net/media/pending/actor/create-ghost/a.jpg"
    const response = await DELETE(new Request("http://localhost/api/bio/upload", {
      method: "DELETE",
      body: JSON.stringify({
        url,
        clientPayload: JSON.stringify({ scope: "create-ghost" }),
      }),
    }))

    expect(response.status).toBe(200)
    expect(isAzureMediaUrlInPrefix).toHaveBeenCalledWith(
      url,
      "pending/actor/create-ghost",
    )
    expect(deleteUnreferencedMediaUrls).toHaveBeenCalledWith([url])
  })

  it("rejects deleting a URL outside the authorized prefix", async () => {
    isAzureMediaUrlInPrefix.mockReturnValue(false)
    const response = await DELETE(new Request("http://localhost/api/bio/upload", {
      method: "DELETE",
      body: JSON.stringify({
        url: "https://storage.blob.core.windows.net/media/profiles/other/avatar.jpg",
        clientPayload: JSON.stringify({ scope: "create-ghost" }),
      }),
    }))

    expect(response.status).toBe(400)
    expect(deleteUnreferencedMediaUrls).not.toHaveBeenCalled()
  })
})
