import { afterEach, describe, expect, it, vi } from "vitest"
import { uploadMedia } from "./media-upload"

const put = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob/client', () => ({ put }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe("uploadMedia", () => {
  it("uses the scoped Blob client then confirms the staged URL with the authenticated route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider: 'vercel', pathname: 'staging/profiles/p/avatar/id.png', clientToken: 'scoped', access: 'private' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://public.example/published.png' })))
    vi.stubGlobal('fetch', fetchMock)
    put.mockResolvedValue({ url: 'https://private.example/staging/id.png' })
    const file = new Blob(['png'], { type: 'image/png' })
    await expect(uploadMedia('arbitrary.png', file, { handleUploadUrl: '/api/bio/upload', clientPayload: '{"profileId":"p"}' })).resolves.toEqual({ url: 'https://public.example/published.png' })
    expect(put).toHaveBeenCalledWith('staging/profiles/p/avatar/id.png', file, { token: 'scoped', access: 'private', contentType: 'image/png', multipart: false })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ type: 'media.upload.complete', url: 'https://private.example/staging/id.png', clientPayload: '{"profileId":"p"}' })
  })

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
