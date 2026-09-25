import { afterEach, describe, expect, it } from "vitest"
import { BLOB_URL_PATTERN, isAllowedMediaUrl, isLegacyVercelBlobUrl } from "./blob"

const originalBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL
const originalPublicBaseUrl = process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL
  else process.env.MEDIA_PUBLIC_BASE_URL = originalBaseUrl
  if (originalPublicBaseUrl === undefined) delete process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL
  else process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL = originalPublicBaseUrl
})

describe("media URL validation", () => {
  it("accepts legacy Vercel Blob URLs during migration", () => {
    const url = "https://store.public.blob.vercel-storage.com/gallery/photo.jpg"
    expect(BLOB_URL_PATTERN.test(url)).toBe(true)
    expect(isLegacyVercelBlobUrl(url)).toBe(true)
    expect(isAllowedMediaUrl(url)).toBe(true)
  })

  it("pins Azure media to the configured account and container", () => {
    const base = "https://stgenmediaexample.blob.core.windows.net/media"
    process.env.MEDIA_PUBLIC_BASE_URL = base
    process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL = base

    expect(
      isAllowedMediaUrl(
        "https://stgenmediaexample.blob.core.windows.net/media/profiles/a/avatar.jpg",
      ),
    ).toBe(true)
    expect(
      isAllowedMediaUrl(
        "https://attacker.blob.core.windows.net/media/profiles/a/avatar.jpg",
      ),
    ).toBe(false)
    expect(
      isAllowedMediaUrl(
        "https://stgenmediaexample.blob.core.windows.net/other/avatar.jpg",
      ),
    ).toBe(false)
  })

  it("accepts the configured Azurite origin for local development", () => {
    const base = "http://127.0.0.1:10000/devstoreaccount1/media"
    process.env.MEDIA_PUBLIC_BASE_URL = base
    process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL = base
    expect(
      isAllowedMediaUrl(
        "http://127.0.0.1:10000/devstoreaccount1/media/profiles/local/avatar.jpg",
      ),
    ).toBe(true)
  })

  it("rejects arbitrary URLs", () => {
    expect(isAllowedMediaUrl("https://example.com/tracker.gif")).toBe(false)
  })
})
