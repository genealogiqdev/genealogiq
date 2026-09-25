import { afterEach, describe, expect, it, vi } from "vitest"
import { uploadMedia } from "./media-upload"

afterEach(() => vi.unstubAllGlobals())

describe("uploadMedia", () => {
  it("authorizes, uploads directly, and confirms the Azure blob", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: "https://account.blob.core.windows.net/media/profiles/p/avatar/id.jpg",
        uploadUrl: "https://account.blob.core.windows.net/media/profiles/p/avatar/id.jpg?sig=test",
        headers: {
          "content-type": "image/jpeg",
          "x-ms-blob-type": "BlockBlob",
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: "https://account.blob.core.windows.net/media/profiles/p/avatar/id.jpg",
      }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const file = new Blob(["jpeg"], { type: "image/jpeg" })

    await expect(uploadMedia("portrait/photo.jpg", file, {
      access: "public",
      handleUploadUrl: "/api/bio/upload",
      clientPayload: JSON.stringify({ profileId: "p" }),
    })).resolves.toEqual({
      url: "https://account.blob.core.windows.net/media/profiles/p/avatar/id.jpg",
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: file,
    })
  })

  it("surfaces authorization failures without attempting the PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 400 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(uploadMedia("photo.jpg", new Blob(["x"], { type: "image/jpeg" }), {
      handleUploadUrl: "/api/bio/upload",
    })).rejects.toThrow("Forbidden")
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
