import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'

const LEGACY_VERCEL_HOST = /\.public\.blob\.vercel-storage\.com$/i
const DEFAULT_MEDIA_CONTAINER = 'media'
const DEFAULT_STAGING_CONTAINER = 'media-staging'
const DEFAULT_MIGRATION_CONTAINER = 'media-migration'
const SAS_TTL_MS = 10 * 60 * 1000
const AZURITE_ACCOUNT_NAME = 'devstoreaccount1'
const AZURITE_ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='

export interface MediaUploadFile {
  name: string
  type: string
  size: number
}

export type MediaUploadBody =
  | {
      type: 'media.upload.authorize'
      file: MediaUploadFile
      clientPayload: string | null
    }
  | {
      type: 'media.upload.complete'
      url: string
      clientPayload: string | null
    }

export interface MediaUploadPolicy {
  allowedContentTypes: readonly string[]
  maximumSizeInBytes: number
  prefix: string
  container?: 'media' | 'staging'
  verifyFileSignature?: boolean
}

export interface AuthorizedMediaUpload {
  url: string
  uploadUrl: string
  headers: Record<string, string>
  expiresAt: string
}

interface StorageConfig {
  accountName: string
  accountUrl: string
  mediaContainer: string
  stagingContainer: string
  migrationContainer: string
  publicBaseUrl: string
  connectionString?: string
  sharedKeyCredential?: StorageSharedKeyCredential
}

let serviceClient: BlobServiceClient | undefined
let cachedConfig: StorageConfig | undefined
let developmentSetup: Promise<void> | undefined

export async function readMediaUploadBody(request: Request): Promise<MediaUploadBody> {
  const raw = (await request.json()) as Partial<MediaUploadBody>
  const clientPayload = typeof raw.clientPayload === 'string' ? raw.clientPayload : null

  if (raw.type === 'media.upload.authorize') {
    const file = raw.file as Partial<MediaUploadFile> | undefined
    if (
      !file ||
      typeof file.name !== 'string' ||
      typeof file.type !== 'string' ||
      typeof file.size !== 'number' ||
      !Number.isFinite(file.size)
    ) {
      throw new Error('Invalid upload request')
    }
    return {
      type: raw.type,
      file: { name: file.name, type: file.type, size: file.size },
      clientPayload,
    }
  }

  if (raw.type === 'media.upload.complete' && typeof raw.url === 'string') {
    return { type: raw.type, url: raw.url, clientPayload }
  }

  throw new Error('Invalid upload request')
}

export async function processMediaUpload(
  body: MediaUploadBody,
  policy: MediaUploadPolicy,
): Promise<AuthorizedMediaUpload | { url: string; size: number; contentType: string }> {
  if (body.type === 'media.upload.authorize') {
    return createAuthorizedUpload(body.file, policy)
  }
  return completeMediaUpload(body.url, policy)
}

export async function createAuthorizedUpload(
  file: MediaUploadFile,
  policy: MediaUploadPolicy,
): Promise<AuthorizedMediaUpload> {
  validateFile(file, policy)

  const config = getStorageConfig()
  const client = getServiceClient(config)
  await ensureDevelopmentContainers(client, config)
  const containerName =
    policy.container === 'staging' ? config.stagingContainer : config.mediaContainer
  const blobName = `${sanitizePrefix(policy.prefix)}/${randomUUID()}.${extensionFor(file.type)}`
  const blob = client.getContainerClient(containerName).getBlockBlobClient(blobName)
  const startsOn = new Date(Date.now() - 60_000)
  const expiresOn = new Date(Date.now() + SAS_TTL_MS)
  const sas = await createBlobSas(
    config,
    client,
    containerName,
    blobName,
    'c',
    startsOn,
    expiresOn,
  )

  return {
    url:
      policy.container === 'staging'
        ? blob.url
        : `${config.publicBaseUrl}/${encodeBlobName(blobName)}`,
    uploadUrl: `${blob.url}?${sas}`,
    headers: {
      'content-type': file.type,
      'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
      'x-ms-blob-type': 'BlockBlob',
    },
    expiresAt: expiresOn.toISOString(),
  }
}

export async function completeMediaUpload(
  url: string,
  policy: MediaUploadPolicy,
): Promise<{ url: string; size: number; contentType: string }> {
  const parsed = parseAzureMediaUrl(url, policy.container)
  if (!parsed.blobName.startsWith(`${sanitizePrefix(policy.prefix)}/`)) {
    throw new Error('Upload does not belong to the authorized profile')
  }

  const blob = getServiceClient(parsed.config)
    .getContainerClient(parsed.containerName)
    .getBlockBlobClient(parsed.blobName)
  const properties = await blob.getProperties()
  const size = properties.contentLength ?? 0
  const contentType = properties.contentType ?? ''

  try {
    validateFile({ name: parsed.blobName, type: contentType, size }, policy)
    if (policy.verifyFileSignature !== false) {
      const bytes = await blob.downloadToBuffer(0, Math.min(size, 32))
      if (!hasExpectedSignature(contentType, bytes)) {
        throw new Error('Uploaded file content does not match its declared type')
      }
    }
  } catch (error) {
    await blob.deleteIfExists({ deleteSnapshots: 'include' }).catch(() => undefined)
    throw error
  }

  if (policy.container === 'staging') {
    const config = parsed.config
    const client = getServiceClient(config)
    const startsOn = new Date(Date.now() - 60_000)
    const expiresOn = new Date(Date.now() + SAS_TTL_MS)
    const readSas = await createBlobSas(
      config,
      client,
      parsed.containerName,
      parsed.blobName,
      'r',
      startsOn,
      expiresOn,
    )
    const published = client
      .getContainerClient(config.mediaContainer)
      .getBlockBlobClient(parsed.blobName)
    await published.syncCopyFromURL(`${blob.url}?${readSas}`)
    await blob.deleteIfExists({ deleteSnapshots: 'include' })
    return {
      url: `${config.publicBaseUrl}/${encodeBlobName(parsed.blobName)}`,
      size,
      contentType,
    }
  }

  return { url, size, contentType }
}

export async function deleteMediaUrls(
  urls: readonly (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))]
  if (unique.length === 0) return

  const azure: string[] = []
  for (const url of unique) {
    try {
      const parsed = new URL(url)
      // Legacy Vercel objects are intentionally left in place. They require no
      // SDK/token to read and are replaced by the referenced-only migration.
      if (!LEGACY_VERCEL_HOST.test(parsed.hostname)) azure.push(url)
    } catch {
      // Ignore malformed legacy values during best-effort cleanup.
    }
  }

  await Promise.all(
    azure.map(async (url) => {
      try {
        const parsed = parseAzureMediaUrl(url)
        await getServiceClient(parsed.config)
          .getContainerClient(parsed.containerName)
          .getBlockBlobClient(parsed.blobName)
          .deleteIfExists({ deleteSnapshots: 'include' })
      } catch (error) {
        // Cleanup is best effort; database mutations remain authoritative.
        console.error('[media] Azure blob cleanup failed', { url, error })
      }
    }),
  )

}

export async function deleteUnreferencedMediaUrls(
  urls: readonly (string | null | undefined)[],
): Promise<void> {
  const candidates = [...new Set(urls.filter((url): url is string => Boolean(url)))]
  if (candidates.length === 0) return

  let prisma: typeof import('@genealogiq/db')['prisma']
  try {
    ;({ prisma } = await import('@genealogiq/db'))
  } catch (error) {
    console.error('[media] unable to initialize reference-safe cleanup', error)
    return
  }
  const unreferenced: string[] = []

  for (const url of candidates) {
    try {
      const counts = await Promise.all([
        prisma.user.count({ where: { OR: [{ avatarUrl: url }, { cover_url: url }] } }),
        prisma.appUser.count({ where: { avatarUrl: url } }),
        prisma.bioImage.count({ where: { url } }),
        prisma.tribute.count({ where: { imageUrl: url } }),
        prisma.galleryItem.count({ where: { OR: [{ url }, { poster: url }] } }),
        prisma.geoPlace.count({ where: { photos: { has: url } } }),
        prisma.document.count({ where: { fileUrl: url } }),
        prisma.geolocation.count({
          where: { OR: [{ photo1: url }, { photo2: url }, { photo3: url }] },
        }),
      ])
      if (counts.every((count) => count === 0)) unreferenced.push(url)
    } catch (error) {
      console.error('[media] reference check failed; skipping blob cleanup', { url, error })
    }
  }

  await deleteMediaUrls(unreferenced)
}

export async function getMediaObjectSize(url: string): Promise<number> {
  if (LEGACY_VERCEL_HOST.test(new URL(url).hostname)) {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) throw new Error(`Unable to inspect legacy media (${response.status})`)
    return Number(response.headers.get('content-length') || 0)
  }

  const parsed = parseAzureMediaUrl(url)
  const properties = await getServiceClient(parsed.config)
    .getContainerClient(parsed.containerName)
    .getBlobClient(parsed.blobName)
    .getProperties()
  return properties.contentLength ?? 0
}

export async function getMediaObjectIntegrity(
  url: string,
): Promise<{ size: number; sha256: string }> {
  let bytes: Buffer
  if (LEGACY_VERCEL_HOST.test(new URL(url).hostname)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Unable to read legacy media (${response.status})`)
    bytes = Buffer.from(await response.arrayBuffer())
  } else {
    const parsed = parseAzureMediaUrl(url)
    bytes = await getServiceClient(parsed.config)
      .getContainerClient(parsed.containerName)
      .getBlobClient(parsed.blobName)
      .downloadToBuffer()
  }
  return {
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function copyPublicUrlToMedia(
  sourceUrl: string,
  destinationName: string,
): Promise<{ url: string; size: number; sha256: string; contentType: string }> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Unable to download ${sourceUrl} (${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
  const config = getStorageConfig()
  const blobName = sanitizeBlobName(destinationName)
  const blob = getServiceClient(config)
    .getContainerClient(config.mediaContainer)
    .getBlockBlobClient(blobName)

  await blob.uploadData(bytes, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobContentDisposition: response.headers.get('content-disposition') || undefined,
      blobCacheControl: response.headers.get('cache-control') || 'public, max-age=31536000, immutable',
    },
  })

  const properties = await blob.getProperties()
  if ((properties.contentLength ?? -1) !== bytes.length) {
    await blob.deleteIfExists({ deleteSnapshots: 'include' }).catch(() => undefined)
    throw new Error(`Size verification failed for ${sourceUrl}`)
  }

  return {
    url: `${config.publicBaseUrl}/${encodeBlobName(blobName)}`,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType,
  }
}

export async function readPrivateMediaText(blobName: string): Promise<string | null> {
  const config = getStorageConfig()
  const blob = getServiceClient(config)
    .getContainerClient(config.migrationContainer)
    .getBlockBlobClient(sanitizeBlobName(blobName))
  if (!(await blob.exists())) return null
  return blob.downloadToBuffer().then((buffer) => buffer.toString('utf8'))
}

export async function writePrivateMediaText(blobName: string, value: string): Promise<void> {
  const config = getStorageConfig()
  const client = getServiceClient(config)
  await ensureDevelopmentContainers(client, config)
  await client
    .getContainerClient(config.migrationContainer)
    .getBlockBlobClient(sanitizeBlobName(blobName))
    .uploadData(Buffer.from(value, 'utf8'), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
}

export function isAzureMediaUrl(url: string): boolean {
  try {
    parseAzureMediaUrl(url)
    return true
  } catch {
    return false
  }
}

export function isAzureMediaUrlInPrefix(url: string, prefix: string): boolean {
  try {
    const parsed = parseAzureMediaUrl(url, 'media')
    return parsed.blobName.startsWith(`${sanitizePrefix(prefix)}/`)
  } catch {
    return false
  }
}

export function isAuthorizedMediaReference(
  url: string | null | undefined,
  prefixes: readonly string[],
  options: { allowLegacy?: boolean } = {},
): boolean {
  if (!url) return true
  try {
    if (LEGACY_VERCEL_HOST.test(new URL(url).hostname)) {
      return options.allowLegacy !== false
    }
  } catch {
    return false
  }
  return prefixes.some((prefix) => isAzureMediaUrlInPrefix(url, prefix))
}

export function getMediaPublicBaseUrl(): string {
  return getStorageConfig().publicBaseUrl
}

export function resetMediaStorageForTests(): void {
  serviceClient = undefined
  cachedConfig = undefined
  developmentSetup = undefined
}

function validateFile(file: MediaUploadFile, policy: MediaUploadPolicy): void {
  if (!policy.allowedContentTypes.includes(file.type)) {
    throw new Error('File type is not allowed')
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new Error('File is empty')
  }
  if (file.size > policy.maximumSizeInBytes) {
    throw new Error(`File exceeds the ${policy.maximumSizeInBytes} byte limit`)
  }
}

function sanitizePrefix(prefix: string): string {
  const sanitized = prefix
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/')
  if (!sanitized) throw new Error('Invalid media prefix')
  return sanitized
}

function sanitizeBlobName(name: string): string {
  const parts = name
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .filter(Boolean)
  if (parts.length === 0) throw new Error('Invalid media object name')
  return parts.join('/')
}

function extensionFor(contentType: string): string {
  const extensions: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
  }
  return extensions[contentType] ?? 'bin'
}

function hasExpectedSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (contentType === 'image/gif') {
    const signature = bytes.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (contentType === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (contentType === 'application/pdf') {
    return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  }
  if (contentType === 'video/webm') {
    return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  }
  if (contentType === 'video/mp4' || contentType === 'video/quicktime' || contentType === 'video/x-m4v') {
    return bytes.includes(Buffer.from('ftyp'))
  }
  return false
}

function getStorageConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim()
  const mediaContainer = process.env.AZURE_STORAGE_MEDIA_CONTAINER || DEFAULT_MEDIA_CONTAINER
  const stagingContainer =
    process.env.AZURE_STORAGE_STAGING_CONTAINER || DEFAULT_STAGING_CONTAINER
  const migrationContainer =
    process.env.AZURE_STORAGE_MIGRATION_CONTAINER || DEFAULT_MIGRATION_CONTAINER

  if (connectionString) {
    const normalizedConnectionString =
      connectionString === 'UseDevelopmentStorage=true'
        ? `DefaultEndpointsProtocol=http;AccountName=${AZURITE_ACCOUNT_NAME};AccountKey=${AZURITE_ACCOUNT_KEY};BlobEndpoint=http://127.0.0.1:10000/${AZURITE_ACCOUNT_NAME};`
        : connectionString
    const values = normalizedConnectionString.split(';').reduce<Record<string, string>>((result, part) => {
      const separator = part.indexOf('=')
      if (separator > 0) result[part.slice(0, separator)] = part.slice(separator + 1)
      return result
    }, {})
    const accountName = values.AccountName
    const accountKey = values.AccountKey
    const accountUrl =
      values.BlobEndpoint ||
      (values.DefaultEndpointsProtocol && values.EndpointSuffix
        ? `${values.DefaultEndpointsProtocol}://${accountName}.blob.${values.EndpointSuffix}`
        : undefined)
    if (!accountName || !accountKey || !accountUrl) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is missing account details')
    }
    cachedConfig = {
      accountName,
      accountUrl: accountUrl.replace(/\/$/, ''),
      mediaContainer,
      stagingContainer,
      migrationContainer,
      publicBaseUrl: (
        process.env.MEDIA_PUBLIC_BASE_URL || `${accountUrl.replace(/\/$/, '')}/${mediaContainer}`
      ).replace(/\/$/, ''),
      connectionString: normalizedConnectionString,
      sharedKeyCredential: new StorageSharedKeyCredential(accountName, accountKey),
    }
    return cachedConfig
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim()
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim().replace(/\/$/, '')
  if (!accountName || !accountUrl) {
    throw new Error('Azure media storage is not configured')
  }

  cachedConfig = {
    accountName,
    accountUrl,
    mediaContainer,
    stagingContainer,
    migrationContainer,
    publicBaseUrl: (
      process.env.MEDIA_PUBLIC_BASE_URL || `${accountUrl}/${mediaContainer}`
    ).replace(/\/$/, ''),
  }
  return cachedConfig
}

function getServiceClient(config: StorageConfig): BlobServiceClient {
  if (serviceClient) return serviceClient
  if (config.connectionString) {
    serviceClient = BlobServiceClient.fromConnectionString(config.connectionString)
    return serviceClient
  }

  const clientId = process.env.AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID?.trim()
  const credential = clientId
    ? new ManagedIdentityCredential(clientId)
    : new DefaultAzureCredential()
  serviceClient = new BlobServiceClient(config.accountUrl, credential)
  return serviceClient
}

async function createBlobSas(
  config: StorageConfig,
  client: BlobServiceClient,
  containerName: string,
  blobName: string,
  permissions: string,
  startsOn: Date,
  expiresOn: Date,
): Promise<string> {
  const values = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse(permissions),
    protocol: config.accountUrl.startsWith('http://') ? SASProtocol.HttpsAndHttp : SASProtocol.Https,
    startsOn,
    expiresOn,
  }
  const sas = config.sharedKeyCredential
    ? generateBlobSASQueryParameters(values, config.sharedKeyCredential)
    : generateBlobSASQueryParameters(
        values,
        await client.getUserDelegationKey(startsOn, expiresOn),
        config.accountName,
      )
  return sas.toString()
}

function parseAzureMediaUrl(
  value: string,
  expectedContainer?: 'media' | 'staging',
): {
  config: StorageConfig
  containerName: string
  blobName: string
} {
  const config = getStorageConfig()
  const url = new URL(value)
  const account = new URL(config.accountUrl)
  if (url.origin !== account.origin) throw new Error('Unexpected media origin')

  const accountPath = account.pathname.replace(/\/+$/, '')
  if (accountPath && !url.pathname.startsWith(`${accountPath}/`)) {
    throw new Error('Unexpected media account path')
  }
  const relativePath = accountPath ? url.pathname.slice(accountPath.length) : url.pathname
  const [containerName, ...blobParts] = relativePath.split('/').filter(Boolean)
  const allowedContainer =
    expectedContainer === 'staging'
      ? config.stagingContainer
      : expectedContainer === 'media'
        ? config.mediaContainer
        : undefined
  if (
    !containerName ||
    (allowedContainer && containerName !== allowedContainer) ||
    (!allowedContainer &&
      containerName !== config.mediaContainer &&
      containerName !== config.stagingContainer)
  ) {
    throw new Error('Unexpected media container')
  }
  if (blobParts.length === 0) throw new Error('Missing media object name')

  return {
    config,
    containerName,
    blobName: blobParts.map(decodeURIComponent).join('/'),
  }
}

function encodeBlobName(blobName: string): string {
  return blobName.split('/').map(encodeURIComponent).join('/')
}

async function ensureDevelopmentContainers(
  client: BlobServiceClient,
  config: StorageConfig,
): Promise<void> {
  if (!config.connectionString) return
  developmentSetup ??= (async () => {
    await client.setProperties({
      cors: [
        {
          allowedOrigins: '*',
          allowedMethods: 'GET,HEAD,OPTIONS,PUT',
          allowedHeaders: '*',
          exposedHeaders: '*',
          maxAgeInSeconds: 3600,
        },
      ],
    })
    await client.getContainerClient(config.mediaContainer).createIfNotExists({ access: 'blob' })
    await client.getContainerClient(config.stagingContainer).createIfNotExists()
    await client.getContainerClient(config.migrationContainer).createIfNotExists()
  })()
  await developmentSetup
}
