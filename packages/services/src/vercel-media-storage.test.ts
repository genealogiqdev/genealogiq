import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn(), put: vi.fn(), del: vi.fn(), token: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@vercel/blob', async importOriginal => ({ ...await importOriginal<typeof import('@vercel/blob')>(), ...sdk }))
vi.mock('@vercel/blob/client', () => ({ generateClientTokenFromReadWriteToken: sdk.token }))
import { completeMediaUpload, createAuthorizedUpload, isAuthorizedMediaReference } from './media-storage'
import { BlobNotFoundError } from '@vercel/blob'
import { getVercelMediaIntegrity, importVercelMedia } from './vercel-media-storage'

const policy = { prefix: 'profiles/p1/avatar', allowedContentTypes: ['image/png'], maximumSizeInBytes: 100 }
const staging = 'https://private123.private.blob.vercel-storage.com/staging/profiles/p1/avatar/id.png'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const object = (bytes = png) => ({ statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } }), blob: { size: bytes.length, contentType: 'image/png' } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'vercel')
  vi.stubEnv('BLOB_PUBLIC_READ_WRITE_TOKEN', 'vercel_blob_rw_public123_test')
  vi.stubEnv('BLOB_PRIVATE_READ_WRITE_TOKEN', 'vercel_blob_rw_private123_test')
  sdk.token.mockResolvedValue('scoped-client-token')
  sdk.head.mockResolvedValue({ size: 8, contentType: 'image/png' })
  sdk.get.mockImplementation(() => Promise.resolve(object()))
  sdk.put.mockResolvedValue({ url: 'https://public123.public.blob.vercel-storage.com/profiles/p1/avatar/id.png' })
  sdk.del.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('Vercel upload boundary', () => {
  it('issues only a private, create-only token for a server-generated key and exact file limits', async () => {
    const result = await createAuthorizedUpload({ name: '../../other.png', type: 'image/png', size: 8 }, policy)
    expect(result).toMatchObject({ provider: 'vercel', access: 'private', clientToken: 'scoped-client-token' })
    expect(sdk.token).toHaveBeenCalledWith(expect.objectContaining({
      token: 'vercel_blob_rw_private123_test', pathname: expect.stringMatching(/^staging\/profiles\/p1\/avatar\/[a-f0-9-]+\.png$/),
      allowedContentTypes: ['image/png'], maximumSizeInBytes: 8, addRandomSuffix: false, allowOverwrite: false,
    }))
    expect(sdk.token.mock.calls[0][0].validUntil).toBeLessThanOrEqual(Date.now() + 600000)
    expect(JSON.stringify(result)).not.toContain('vercel_blob_rw_')
  })

  it.each([['image/png', 101], ['text/html', 8], ['image/png', 0]])('rejects invalid file %s/%s before token issuance', async (type, size) => {
    await expect(createAuthorizedUpload({ name: 'x', type, size }, policy)).rejects.toThrow()
    expect(sdk.token).not.toHaveBeenCalled()
  })

  it('validates staged bytes, streams to public storage, then removes quarantine', async () => {
    await expect(completeMediaUpload(staging, policy)).resolves.toEqual({ url: 'https://public123.public.blob.vercel-storage.com/profiles/p1/avatar/id.png', size: 8, contentType: 'image/png' })
    expect(sdk.put).toHaveBeenCalledWith('profiles/p1/avatar/id.png', expect.any(ReadableStream), expect.objectContaining({ access: 'public', token: 'vercel_blob_rw_public123_test', allowOverwrite: false }))
    expect(sdk.del).toHaveBeenCalledWith(staging, { token: 'vercel_blob_rw_private123_test' })
    expect(sdk.put.mock.invocationCallOrder[0]).toBeLessThan(sdk.del.mock.invocationCallOrder[0])
  })

  it('keeps document bytes in private storage after completion', async () => {
    await completeMediaUpload(staging, { ...policy, access: 'private' })
    expect(sdk.put).toHaveBeenCalledWith('documents/profiles/p1/avatar/id.png', expect.any(ReadableStream), expect.objectContaining({ access: 'private', token: 'vercel_blob_rw_private123_test' }))
  })

  it.each([
    staging.replace('p1/', 'p2/'), staging.replace('private123.', 'foreign.'),
    staging.replace('/staging/', '/documents/'), `${staging}?download=1`,
  ])('rejects a foreign or non-staged URL without reading/deleting bytes: %s', async url => {
    await expect(completeMediaUpload(url, policy)).rejects.toThrow()
    expect(sdk.get).not.toHaveBeenCalled()
    expect(sdk.del).not.toHaveBeenCalled()
  })

  it('deletes invalid bytes without publishing them', async () => {
    sdk.get.mockImplementation(() => Promise.resolve(object(new TextEncoder().encode('<script>'))))
    await expect(completeMediaUpload(staging, policy)).rejects.toThrow('does not match')
    expect(sdk.put).not.toHaveBeenCalled()
    expect(sdk.del).toHaveBeenCalledOnce()
  })

  it('retains staging after a failed publication for retry', async () => {
    sdk.put.mockRejectedValue(new Error('unavailable'))
    await expect(completeMediaUpload(staging, policy)).rejects.toThrow('unavailable')
    expect(sdk.del).not.toHaveBeenCalled()
  })

  it('enforces store, profile, and verified destination prefixes on persisted references', () => {
    const publicUrl = 'https://public123.public.blob.vercel-storage.com/profiles/p1/avatar/id.png'
    expect(isAuthorizedMediaReference(publicUrl, [policy.prefix], { allowLegacy: false })).toBe(true)
    expect(isAuthorizedMediaReference(publicUrl.replace('p1/', 'p2/'), [policy.prefix], { allowLegacy: false })).toBe(false)
    expect(isAuthorizedMediaReference(publicUrl.replace('public123.', 'foreign.'), [policy.prefix], { allowLegacy: false })).toBe(false)
    expect(isAuthorizedMediaReference(staging, [policy.prefix], { allowLegacy: false, allowPrivate: true })).toBe(false)
    expect(isAuthorizedMediaReference(staging.replace('/staging/', '/documents/'), [policy.prefix], { allowLegacy: false })).toBe(false)
    expect(isAuthorizedMediaReference(staging.replace('/staging/', '/documents/'), [policy.prefix], { allowLegacy: false, allowPrivate: true })).toBe(true)
  })

  it('hashes actual object bytes independently of metadata', async () => {
    sdk.get.mockImplementation(() => Promise.resolve(object(new TextEncoder().encode('abc'))))
    await expect(getVercelMediaIntegrity(staging)).resolves.toEqual({ size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })
  })

  it('resumes a copied migration object only when its bytes match', async () => {
    sdk.get.mockImplementation(() => Promise.resolve(object(new TextEncoder().encode('abc'))))
    await expect(importVercelMedia('migration/id', Buffer.from('abc'), 'text/plain', 'public')).resolves.toMatchObject({
      url: 'https://public123.public.blob.vercel-storage.com/migration/id', size: 3,
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })
    expect(sdk.put).not.toHaveBeenCalled()
  })

  it('never overwrites a different migration target or treats provider failure as absence', async () => {
    await expect(importVercelMedia('migration/id', Buffer.from('different'), 'text/plain', 'public')).rejects.toThrow('differs')
    sdk.head.mockRejectedValue(new Error('provider unavailable'))
    await expect(importVercelMedia('migration/id', Buffer.from('abc'), 'text/plain', 'public')).rejects.toThrow('provider unavailable')
    expect(sdk.put).not.toHaveBeenCalled()
  })

  it('creates a missing migration target without overwrite permission', async () => {
    sdk.head.mockRejectedValue(new BlobNotFoundError())
    await importVercelMedia('documents/profiles/p1/documents/id', Buffer.from('abc'), 'application/pdf', 'private')
    expect(sdk.put).toHaveBeenCalledWith('documents/profiles/p1/documents/id', Buffer.from('abc'), expect.objectContaining({
      access: 'private', token: 'vercel_blob_rw_private123_test', allowOverwrite: false,
    }))
  })
})
