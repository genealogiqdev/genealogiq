import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  copyPublicUrlToMedia,
  getMediaObjectIntegrity,
  readPrivateMediaText,
  writePrivateMediaText,
} from './media-storage'
import {
  isReferencedObjectReadyForRewrite,
  legacyDestinationName,
  replaceMediaArray,
} from './media-migration-helpers'

type ModelName =
  | 'User'
  | 'AppUser'
  | 'BioImage'
  | 'Tribute'
  | 'GalleryItem'
  | 'GeoPlace'
  | 'Document'
  | 'Geolocation'

interface MediaReference {
  model: ModelName
  id: string
  field: string
  arrayIndex?: number
  ownerId: string
  sourceUrl: string
}

interface ManifestObject {
  sourceUrl: string
  sourcePathname: string
  sourceSize: number | null
  destinationName: string
  destinationUrl: string | null
  copiedSize: number | null
  sha256: string | null
  contentType: string | null
  copiedAt: string | null
  verifiedAt: string | null
  references: MediaReference[]
  errors: string[]
}

interface MigrationManifest {
  version: 1
  generatedAt: string
  updatedAt: string
  objects: ManifestObject[]
}

const VERCEL_HOST = /\.public\.blob\.vercel-storage\.com$/i
const argumentsSet = new Set(process.argv.slice(2))
const shouldCopy = argumentsSet.has('--copy') || argumentsSet.has('--all')
const shouldRewrite = argumentsSet.has('--rewrite') || argumentsSet.has('--all')
const shouldVerify = argumentsSet.has('--verify') || argumentsSet.has('--all')
const shouldRollback = argumentsSet.has('--rollback')
const manifestArg = process.argv.find((arg) => arg.startsWith('--manifest='))
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const manifestPath = resolve(
  repoRoot,
  manifestArg?.slice('--manifest='.length) || '.azure/media-migration-manifest.json',
)

loadEnv({ path: resolve(repoRoot, 'packages/db/.env') })
loadEnv({ path: resolve(repoRoot, 'apps/app/.env.local') })
loadEnv({ path: resolve(repoRoot, 'apps/app/.env') })
loadEnv({ path: resolve(repoRoot, '.env') })
const remoteManifestName =
  process.env.MEDIA_MIGRATION_MANIFEST_BLOB || 'manifests/current.json'

async function main() {
  if (shouldRewrite && shouldRollback) {
    throw new Error('Choose either --rewrite or --rollback, not both')
  }
  assertConfiguration()
  const { prisma } = await import('@genealogiq/db')
  const previous = await readManifest()
  if (shouldRollback) {
    if (!previous) throw new Error('A migration manifest is required for rollback')
    await rewriteReferences(prisma, previous.objects, 'rollback')
    await prisma.$disconnect()
    console.log('Rollback rewrite completed from the durable migration manifest.')
    return
  }

  const references = await collectReferences(prisma)
  const previousBySource = new Map(
    previous?.objects.map((item) => [item.sourceUrl, item]) ?? [],
  )
  const bySource = new Map<string, ManifestObject>()
  for (const reference of references) {
    const existing = previousBySource.get(reference.sourceUrl)
    if (existing && !bySource.has(reference.sourceUrl)) {
      existing.references = []
      bySource.set(reference.sourceUrl, existing)
    }
    const item = ensureManifestObject(
      bySource,
      reference.sourceUrl,
      pathnameFromUrl(reference.sourceUrl),
      null,
    )
    if (!item.references.some((candidate) => sameReference(candidate, reference))) {
      item.references.push(reference)
    }
  }

  const manifest: MigrationManifest = {
    version: 1,
    generatedAt: previous?.generatedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objects: [...bySource.values()].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl)),
  }
  await saveManifest(manifest)

  console.log(
    `Inventory: ${manifest.objects.length} referenced legacy objects, ${references.length} database references.`,
  )

  if (shouldCopy) {
    for (const [index, item] of manifest.objects.entries()) {
      if (item.destinationUrl && item.copiedAt) continue
      try {
        const copied = await copyPublicUrlToMedia(item.sourceUrl, item.destinationName)
        if (item.sourceSize !== null && copied.size !== item.sourceSize) {
          throw new Error(`source size changed: listed ${item.sourceSize}, copied ${copied.size}`)
        }
        item.destinationUrl = copied.url
        item.copiedSize = copied.size
        item.sha256 = copied.sha256
        item.contentType = copied.contentType
        item.copiedAt = new Date().toISOString()
        item.errors = []
        console.log(`Copied ${index + 1}/${manifest.objects.length}: ${item.sourcePathname}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        item.errors.push(message)
        console.error(`Copy failed: ${item.sourceUrl}: ${message}`)
      }
      manifest.updatedAt = new Date().toISOString()
      await saveManifest(manifest)
    }
  }

  if (shouldVerify) {
    for (const item of manifest.objects) {
      if (!item.destinationUrl) continue
      item.errors = item.errors.filter((message) => !message.startsWith('verify:'))
      try {
        const integrity = await getMediaObjectIntegrity(item.destinationUrl)
        if (item.copiedSize !== null && integrity.size !== item.copiedSize) {
          throw new Error(`expected ${item.copiedSize} bytes, got ${integrity.size}`)
        }
        if (item.sha256 && integrity.sha256 !== item.sha256) {
          throw new Error(`checksum mismatch: expected ${item.sha256}, got ${integrity.sha256}`)
        }
        const publicRead = await fetch(item.destinationUrl, {
          headers: { range: 'bytes=0-0' },
        })
        if (!publicRead.ok || (publicRead.status !== 200 && publicRead.status !== 206)) {
          throw new Error(`public range read returned HTTP ${publicRead.status}`)
        }
        item.verifiedAt = new Date().toISOString()
      } catch (error) {
        item.verifiedAt = null
        item.errors.push(`verify: ${error instanceof Error ? error.message : String(error)}`)
      }
      manifest.updatedAt = new Date().toISOString()
      await saveManifest(manifest)
    }
  }

  if (shouldRewrite) {
    const notReady = manifest.objects.filter(
      (item) => !isReferencedObjectReadyForRewrite(item),
    )
    if (notReady.length > 0) {
      throw new Error(`Refusing to rewrite: ${notReady.length} referenced objects were not copied`)
    }
    await rewriteReferences(prisma, manifest.objects, 'forward')
    const remaining = await collectReferences(prisma)
    if (remaining.length > 0) {
      throw new Error(`Rewrite completed with ${remaining.length} legacy database references remaining`)
    }
    console.log('Rewrite verification: zero legacy database references remain.')
  }

  if (shouldRollback) {
    await rewriteReferences(prisma, manifest.objects, 'rollback')
  }

  const errors = manifest.objects.filter((item) => item.errors.length > 0)
  console.log(`Manifest: ${manifestPath}`)
  console.log(`Copied: ${manifest.objects.filter((item) => item.copiedAt).length}`)
  console.log(`Verified: ${manifest.objects.filter((item) => item.verifiedAt).length}`)
  console.log(`Errors: ${errors.length}`)
  await prisma.$disconnect()
  if (errors.length > 0) process.exitCode = 1
}

function assertConfiguration() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (
    !process.env.AZURE_STORAGE_CONNECTION_STRING &&
    (!process.env.AZURE_STORAGE_ACCOUNT_NAME || !process.env.AZURE_STORAGE_ACCOUNT_URL)
  ) {
    throw new Error('Azure media storage configuration is required')
  }
}

async function collectReferences(
  prisma: typeof import('@genealogiq/db')['prisma'],
): Promise<MediaReference[]> {
  const references: MediaReference[] = []
  const push = (
    model: ModelName,
    id: string,
    field: string,
    ownerId: string,
    sourceUrl: string | null | undefined,
    arrayIndex?: number,
  ) => {
    if (!sourceUrl || !isVercelUrl(sourceUrl)) return
    references.push({ model, id, field, ownerId, sourceUrl, arrayIndex })
  }

  const [
    users,
    appUsers,
    bioImages,
    tributes,
    galleryItems,
    geoPlaces,
    documents,
    geolocations,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, avatarUrl: true, cover_url: true } }),
    prisma.appUser.findMany({ select: { id: true, avatarUrl: true } }),
    prisma.bioImage.findMany({ select: { id: true, url: true, bio: { select: { userId: true } } } }),
    prisma.tribute.findMany({ select: { id: true, imageUrl: true, profileId: true } }),
    prisma.galleryItem.findMany({ select: { id: true, url: true, poster: true, userId: true } }),
    prisma.geoPlace.findMany({ select: { id: true, photos: true, userId: true } }),
    prisma.document.findMany({ select: { id: true, fileUrl: true, userId: true } }),
    prisma.geolocation.findMany({
      select: { id: true, photo1: true, photo2: true, photo3: true, userId: true },
    }),
  ])

  for (const row of users) {
    push('User', row.id, 'avatarUrl', row.id, row.avatarUrl)
    push('User', row.id, 'cover_url', row.id, row.cover_url)
  }
  for (const row of appUsers) push('AppUser', row.id, 'avatarUrl', row.id, row.avatarUrl)
  for (const row of bioImages) push('BioImage', row.id, 'url', row.bio.userId, row.url)
  for (const row of tributes) push('Tribute', row.id, 'imageUrl', row.profileId, row.imageUrl)
  for (const row of galleryItems) {
    push('GalleryItem', row.id, 'url', row.userId, row.url)
    push('GalleryItem', row.id, 'poster', row.userId, row.poster)
  }
  for (const row of geoPlaces) {
    row.photos.forEach((url, index) => push('GeoPlace', row.id, 'photos', row.userId, url, index))
  }
  for (const row of documents) push('Document', row.id, 'fileUrl', row.userId, row.fileUrl)
  for (const row of geolocations) {
    push('Geolocation', row.id, 'photo1', row.userId, row.photo1)
    push('Geolocation', row.id, 'photo2', row.userId, row.photo2)
    push('Geolocation', row.id, 'photo3', row.userId, row.photo3)
  }
  return references
}

function ensureManifestObject(
  objects: Map<string, ManifestObject>,
  sourceUrl: string,
  pathname: string,
  size: number | null,
): ManifestObject {
  const existing = objects.get(sourceUrl)
  if (existing) {
    if (existing.sourceSize === null) existing.sourceSize = size
    return existing
  }
  const created: ManifestObject = {
    sourceUrl,
    sourcePathname: pathname,
    sourceSize: size,
    destinationName: legacyDestinationName(sourceUrl, pathname),
    destinationUrl: null,
    copiedSize: null,
    sha256: null,
    contentType: null,
    copiedAt: null,
    verifiedAt: null,
    references: [],
    errors: [],
  }
  objects.set(sourceUrl, created)
  return created
}

async function rewriteReferences(
  prisma: typeof import('@genealogiq/db')['prisma'],
  objects: ManifestObject[],
  direction: 'forward' | 'rollback',
) {
  const replacements = new Map(
    objects
      .filter((item): item is ManifestObject & { destinationUrl: string } => Boolean(item.destinationUrl))
      .map((item) =>
        direction === 'forward'
          ? [item.sourceUrl, item.destinationUrl]
          : [item.destinationUrl, item.sourceUrl],
      ),
  )

  for (const item of objects) {
    if (!item.destinationUrl) continue
    for (const reference of item.references) {
      if (reference.model === 'GeoPlace') continue
      const fromUrl = direction === 'forward' ? reference.sourceUrl : item.destinationUrl
      const toUrl = direction === 'forward' ? item.destinationUrl : reference.sourceUrl
      const where = { id: reference.id, [reference.field]: fromUrl }
      const data = { [reference.field]: toUrl }
      const delegate = delegateFor(prisma, reference.model)
      const result = await delegate.updateMany({ where, data })
      if (result.count > 0) {
        console.log(`${direction === 'forward' ? 'Rewrote' : 'Rolled back'} ${reference.model}.${reference.field} ${reference.id}`)
      }
    }
  }

  const geoPlaceIds = new Set(
    objects.flatMap((item) =>
      item.references.filter((ref) => ref.model === 'GeoPlace').map((ref) => ref.id),
    ),
  )
  for (const id of geoPlaceIds) {
    const current = await prisma.geoPlace.findUnique({ where: { id }, select: { photos: true } })
    if (!current) continue
    const next = replaceMediaArray(current.photos, replacements)
    if (next.changed) {
      await prisma.geoPlace.update({ where: { id }, data: { photos: next.value } })
      console.log(`Rewrote GeoPlace.photos ${id}`)
    }
  }
}

function delegateFor(
  prisma: typeof import('@genealogiq/db')['prisma'],
  model: Exclude<ModelName, 'GeoPlace'>,
): { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }> } {
  const delegates = {
    User: prisma.user,
    AppUser: prisma.appUser,
    BioImage: prisma.bioImage,
    Tribute: prisma.tribute,
    GalleryItem: prisma.galleryItem,
    Document: prisma.document,
    Geolocation: prisma.geolocation,
  }
  return delegates[model] as never
}

function sameReference(left: MediaReference, right: MediaReference): boolean {
  return (
    left.model === right.model &&
    left.id === right.id &&
    left.field === right.field &&
    left.arrayIndex === right.arrayIndex
  )
}

function isVercelUrl(value: string): boolean {
  try {
    return VERCEL_HOST.test(new URL(value).hostname)
  } catch {
    return false
  }
}

function pathnameFromUrl(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.replace(/^\/+/, ''))
  } catch {
    return 'unknown'
  }
}

async function readManifest(): Promise<MigrationManifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8')) as MigrationManifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const remote = await readPrivateMediaText(remoteManifestName)
      return remote ? JSON.parse(remote) as MigrationManifest : null
    }
    throw error
  }
}

async function saveManifest(manifest: MigrationManifest) {
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, serialized, 'utf8')
  await writePrivateMediaText(remoteManifestName, serialized)
}

if (argumentsSet.has('--help')) {
  console.log(
    'Usage: migrate:media [--copy] [--verify] [--rewrite|--rollback] [--all] [--manifest=<path>]',
  )
} else {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
