import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  completeMediaUpload,
  createAuthorizedUpload,
  deleteMediaUrls,
  resetMediaStorageForTests,
} from './media-storage'

const enabled = process.env.RUN_AZURITE_TESTS === 'true'
const suite = describe.runIf(enabled)
const prefix = `integration/${Date.now()}`

suite('Azure media storage (Azurite)', () => {
  beforeAll(() => resetMediaStorageForTests())
  afterAll(() => resetMediaStorageForTests())

  it('uploads, validates, reads, and deletes a PNG through a scoped SAS', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00,
    ])
    const policy = {
      allowedContentTypes: ['image/png'],
      maximumSizeInBytes: 1024,
      prefix,
      container: 'staging' as const,
    }
    const authorized = await createAuthorizedUpload(
      { name: 'pixel.png', type: 'image/png', size: png.length },
      policy,
    )

    const upload = await fetch(authorized.uploadUrl, {
      method: 'PUT',
      headers: authorized.headers,
      body: png,
    })
    expect(upload.ok).toBe(true)
    const overwrite = await fetch(authorized.uploadUrl, {
      method: 'PUT',
      headers: authorized.headers,
      body: png,
    })
    expect(overwrite.ok).toBe(false)

    const completed = await completeMediaUpload(authorized.url, policy)
    expect(completed).toMatchObject({
      url: authorized.url.replace('/media-staging/', '/media/'),
      size: png.length,
      contentType: 'image/png',
    })

    expect((await fetch(completed.url)).status).toBe(200)
    await deleteMediaUrls([completed.url])
    expect((await fetch(completed.url)).status).toBe(404)
  })
})
