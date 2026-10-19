import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { BlobNotFoundError, del, get, head, put } from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import type { MediaUploadFile, MediaUploadPolicy } from './media-storage'
import { extensionFor, hasExpectedSignature, sanitizePrefix, validateFile } from './media-validation'

type Access = 'public' | 'private'
export interface VercelAuthorizedMediaUpload {
  provider: 'vercel'
  pathname: string
  clientToken: string
  access: 'private'
  expiresAt: string
}

export function usesVercelMedia(): boolean {
  const provider = process.env.MEDIA_STORAGE_PROVIDER || 'azure'
  if (provider !== 'azure' && provider !== 'vercel') throw new Error('Invalid media storage provider')
  return provider === 'vercel'
}

function store(access: Access) {
  const key = access === 'public' ? 'BLOB_PUBLIC_READ_WRITE_TOKEN' : 'BLOB_PRIVATE_READ_WRITE_TOKEN'
  const token = process.env[key]?.trim()
  // Store IDs are encoded in the documented Blob read/write token format.
  const id = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/)?.[1]
  if (!id) throw new Error(`${key} is missing or invalid`)
  return { token: token!, origin: `https://${id.toLowerCase()}.${access}.blob.vercel-storage.com`, access }
}

function parseUrl(value: string) {
  const url = new URL(value)
  if (url.search || url.hash || url.username || url.password) throw new Error('Invalid media URL')
  const access = url.hostname.endsWith('.private.blob.vercel-storage.com') ? 'private' : 'public'
  const config = store(access)
  if (url.origin !== config.origin) throw new Error('Unexpected media store')
  const pathname = decodeURIComponent(url.pathname.slice(1))
  if (!pathname || pathname.split('/').some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === '.' || p === '..')) {
    throw new Error('Invalid media pathname')
  }
  return { ...config, pathname }
}

export function getVercelPublicBaseUrl(): string {
  return store('public').origin
}

export function isConfiguredVercelUrl(url: string): boolean {
  try { parseUrl(url); return true } catch { return false }
}

export function isPrivateVercelDocumentUrl(url: string): boolean {
  try {
    const parsed = parseUrl(url)
    return parsed.access === 'private' && parsed.pathname.startsWith('documents/')
  } catch { return false }
}

export function isVercelMediaReference(url: string, prefixes: readonly string[], allowPrivate: boolean): boolean {
  try {
    const parsed = parseUrl(url)
    if (parsed.access === 'private' && !allowPrivate) return false
    const root = parsed.access === 'private' ? 'documents/' : ''
    return prefixes.some(prefix => parsed.pathname.startsWith(`${root}${sanitizePrefix(prefix)}/`))
  } catch { return false }
}

export async function authorizeVercelUpload(file: MediaUploadFile, policy: MediaUploadPolicy): Promise<VercelAuthorizedMediaUpload> {
  validateFile(file, policy)
  const config = store('private')
  // Every browser upload lands in private quarantine, even for public media.
  const pathname = `staging/${sanitizePrefix(policy.prefix)}/${randomUUID()}.${extensionFor(file.type)}`
  const validUntil = Date.now() + 10 * 60 * 1000
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: config.token,
    pathname,
    allowedContentTypes: [file.type],
    maximumSizeInBytes: Math.min(file.size, policy.maximumSizeInBytes),
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: false,
  })
  return { provider: 'vercel', pathname, clientToken, access: 'private', expiresAt: new Date(validUntil).toISOString() }
}

async function readObject(url: string) {
  const config = parseUrl(url)
  const result = await get(url, { token: config.token, access: config.access, useCache: false })
  if (!result || result.statusCode !== 200) throw new Error('Media object not found')
  return result
}

export async function completeVercelUpload(url: string, policy: MediaUploadPolicy) {
  const source = parseUrl(url)
  if (source.access !== 'private' || !source.pathname.startsWith(`staging/${sanitizePrefix(policy.prefix)}/`)) {
    throw new Error('Upload does not belong to the authorized profile')
  }
  const properties = await head(url, { token: source.token })
  const size = properties.size
  const contentType = properties.contentType
  try {
    validateFile({ name: source.pathname, type: contentType, size }, policy)
    if (policy.verifyFileSignature !== false) {
      const object = await readObject(url)
      const reader = object.stream.getReader()
      const chunks: Buffer[] = []
      let length = 0
      try {
        while (length < 32) {
          const chunk = await reader.read()
          if (chunk.done) break
          const bytes = Buffer.from(chunk.value.subarray(0, 32 - length))
          chunks.push(bytes)
          length += bytes.length
        }
      } finally { await reader.cancel() }
      if (!hasExpectedSignature(contentType, Buffer.concat(chunks))) {
        throw new Error('Uploaded file content does not match its declared type')
      }
    }
  } catch (error) {
    await del(url, { token: source.token }).catch(() => undefined)
    throw error
  }
  const access = policy.access ?? 'public'
  const target = store(access)
  const pathname = `${access === 'private' ? 'documents/' : ''}${source.pathname.slice('staging/'.length)}`
  const object = await readObject(url)
  // Stream across stores so video uploads never hit the Function request-body limit.
  const published = await put(pathname, object.stream, {
    token: target.token, access, contentType, addRandomSuffix: false, allowOverwrite: false,
    multipart: size > 8 * 1024 * 1024,
  })
  await del(url, { token: source.token })
  return { url: published.url, size, contentType }
}

export async function deleteVercelMedia(url: string): Promise<void> {
  const config = parseUrl(url)
  await del(url, { token: config.token })
}

export async function getVercelMediaSize(url: string): Promise<number> {
  const config = parseUrl(url)
  return (await head(url, { token: config.token })).size
}

export async function getVercelMediaIntegrity(url: string) {
  const object = await readObject(url)
  const hash = createHash('sha256')
  let size = 0
  const reader = object.stream.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      hash.update(chunk.value)
      size += chunk.value.length
    }
  } finally { reader.releaseLock() }
  return { size, sha256: hash.digest('hex') }
}

export async function readVercelDocument(url: string) {
  if (!isPrivateVercelDocumentUrl(url)) throw new Error('Invalid private document URL')
  return readObject(url)
}

// Release-job entry: caller must inventory/authorize source and verify before rewriting rows.
export async function importVercelMedia(pathname: string, bytes: Buffer, contentType: string, access: Access) {
  const config = store(access)
  const expectedUrl = config.origin + '/' + pathname
  try {
    await head(expectedUrl, { token: config.token })
    const existing = await getVercelMediaIntegrity(expectedUrl)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (existing.size !== bytes.length || existing.sha256 !== sha256) throw new Error('Existing migration target differs from source')
    return { url: expectedUrl, size: bytes.length, sha256, contentType }
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error
  }
  const result = await put(pathname, bytes, {
    token: config.token, access, contentType, addRandomSuffix: false, allowOverwrite: false,
    multipart: bytes.length > 8 * 1024 * 1024,
  })
  return { url: result.url, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType }
}
