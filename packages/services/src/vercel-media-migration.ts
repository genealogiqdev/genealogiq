import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLegacyVercelBlobUrl } from '@genealogiq/core'
import { collectReferences, type MediaReference } from './media-migration'
import { isAzureMediaUrl, readAzureMediaForMigration } from './media-storage'
import { getVercelMediaIntegrity, importVercelMedia, isConfiguredVercelUrl } from './vercel-media-storage'

export interface MigrationItem {
  reference: MediaReference
  destinationName: string
  destinationUrl: string | null
  size: number | null
  sha256: string | null
  verified: boolean
}
interface Manifest {
  version: 1
  database: string
  items: MigrationItem[]
}

export function destinationFor(reference: MediaReference): string {
  // Private documents are separated even when their source URL is shared with a gallery.
  const hash = createHash('sha256').update(`${reference.model}:${reference.id}:${reference.field}:${reference.sourceUrl}`).digest('hex')
  return reference.model === 'Document'
    ? `documents/profiles/${reference.ownerId}/documents/migrated-${hash}`
    : `migration/${hash}`
}

export function verifyIntegrity(expected: { size: number | null; sha256: string | null }, actual: { size: number; sha256: string }) {
  if (expected.size === null || !expected.sha256 || expected.size !== actual.size || expected.sha256 !== actual.sha256) {
    throw new Error('Copied object failed size or SHA-256 verification')
  }
}

type MigrationDb = typeof import('@genealogiq/db')['prisma']
export async function rewriteItem(db: MigrationDb, item: MigrationItem, rollback = false) {
  if (!item.destinationUrl || !item.verified) throw new Error('Refusing unverified reference rewrite')
  const ref = item.reference
  const from = rollback ? item.destinationUrl : ref.sourceUrl
  const to = rollback ? ref.sourceUrl : item.destinationUrl
  if (ref.model === 'GeoPlace') {
    const row = await db.geoPlace.findUnique({ where: { id: ref.id }, select: { photos: true } })
    if (!row || ref.arrayIndex === undefined) throw new Error('Missing array reference')
    if (row.photos[ref.arrayIndex] === to) return
    if (row.photos[ref.arrayIndex] !== from) throw new Error('Stale media reference; no write performed')
    const photos = [...row.photos]
    photos[ref.arrayIndex] = to
    const result = await db.geoPlace.updateMany({ where: { id: ref.id, photos: { equals: row.photos } }, data: { photos } })
    if (result.count !== 1) throw new Error('Concurrent media edit; no write performed')
    return
  }
  const delegates = { User: db.user, AppUser: db.appUser, BioImage: db.bioImage, Tribute: db.tribute, GalleryItem: db.galleryItem, Document: db.document, Geolocation: db.geolocation }
  const delegate = delegates[ref.model] as unknown as {
    updateMany(args: unknown): Promise<{ count: number }>
    findFirst(args: unknown): Promise<unknown>
  }
  const result = await delegate.updateMany({ where: { id: ref.id, [ref.field]: from }, data: { [ref.field]: to } })
  if (result.count !== 1 && !await delegate.findFirst({ where: { id: ref.id, [ref.field]: to }, select: { id: true } })) {
    throw new Error('Stale media reference; no write performed')
  }
}

function isMigrationSource(url: string): boolean {
  return isAzureMediaUrl(url) || (isLegacyVercelBlobUrl(url) && !isConfiguredVercelUrl(url))
}

async function readSource(url: string) {
  if (isAzureMediaUrl(url)) return readAzureMediaForMigration(url)
  if (!isMigrationSource(url)) throw new Error('Invalid migration source')
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error('Legacy media is unavailable')
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('migrate:media:vercel --manifest=<path> [--copy|--verify|--rewrite|--rollback]; default inventories only. Requires explicit DATABASE_URL and MEDIA_MIGRATION_DATABASE_HOST. Never deletes source objects.')
    return
  }
  const stages = ['--copy', '--verify', '--rewrite', '--rollback'].filter(arg => args.includes(arg))
  if (stages.length > 1 || args.some(arg => !stages.includes(arg) && !arg.startsWith('--manifest='))) throw new Error('Choose one migration stage')
  const stage = stages[0]
  const pathArg = args.find(arg => arg.startsWith('--manifest='))?.slice(11)
  if (!pathArg) throw new Error('An explicit durable --manifest path is required')
  const path = resolve(pathArg)
  const databaseUrl = new URL(process.env.DATABASE_URL || '')
  if (databaseUrl.hostname !== process.env.MEDIA_MIGRATION_DATABASE_HOST) throw new Error('Confirm target with MEDIA_MIGRATION_DATABASE_HOST')
  if (!databaseUrl.hostname.endsWith('.neon.tech') && !['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) {
    throw new Error('Use the restored Neon database or an isolated loopback rehearsal database')
  }
  const database = `${databaseUrl.hostname}:${databaseUrl.port}${databaseUrl.pathname}`
  await mkdir(dirname(path), { recursive: true })
  const lock = await open(`${path}.lock`, 'wx')
  let prisma: MigrationDb | undefined
  try {
    prisma = (await import('@genealogiq/db')).prisma
    let manifest: Manifest
    try {
      manifest = JSON.parse(await readFile(path, 'utf8'))
      if (manifest.version !== 1 || manifest.database !== database) throw new Error('Manifest target mismatch')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || stage) throw error
      const refs = await collectReferences(prisma, isMigrationSource)
      manifest = { version: 1, database, items: refs.map(reference => ({ reference, destinationName: destinationFor(reference), destinationUrl: null, size: null, sha256: null, verified: false })) }
    }
    const save = async () => {
      await writeFile(`${path}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
      await rename(`${path}.tmp`, path)
    }
    await save()
    for (const item of manifest.items) {
      // Revalidate the manifest before handing a stored URL to a provider or rewriting a row.
      if (!isMigrationSource(item.reference.sourceUrl) || item.destinationName !== destinationFor(item.reference)) throw new Error('Invalid source or destination in manifest')
      const access = item.reference.model === 'Document' ? 'private' : 'public'
      if (item.destinationUrl && !isConfiguredVercelUrl(item.destinationUrl)) throw new Error('Manifest belongs to a different Blob store')
      if (stage === '--copy' && !item.destinationUrl) {
        const source = await readSource(item.reference.sourceUrl)
        const copied = await importVercelMedia(item.destinationName, source.bytes, source.contentType, access)
        item.destinationUrl = copied.url
        item.size = copied.size
        item.sha256 = copied.sha256
        item.verified = false
        await save()
      }
      if (stage === '--verify') {
        item.verified = false
        await save()
        if (!item.destinationUrl) throw new Error('Copy all objects before verification')
        const source = await readSource(item.reference.sourceUrl)
        verifyIntegrity(item, { size: source.bytes.length, sha256: createHash('sha256').update(source.bytes).digest('hex') })
        verifyIntegrity(item, await getVercelMediaIntegrity(item.destinationUrl))
        const response = await fetch(item.destinationUrl, { headers: { Range: 'bytes=0-0' }, redirect: 'error' })
        await response.body?.cancel()
        if (access === 'private' ? ![401, 403, 404].includes(response.status) : ![200, 206].includes(response.status)) {
          throw new Error('Public/private delivery verification failed')
        }
        item.verified = true
        await save()
      }
    }
    if (stage === '--rewrite' || stage === '--rollback') {
      if (manifest.items.some(item => !item.verified || !item.destinationUrl)) throw new Error('All copies must be verified before rewriting')
      for (const item of manifest.items) await rewriteItem(prisma, item, stage === '--rollback')
      if (stage === '--rewrite' && (await collectReferences(prisma, isMigrationSource)).length) throw new Error('Source references remain; inventory new writes before cutover')
    }
    console.log(`Stage ${stage || 'inventory'}: ${manifest.items.length} references; ${manifest.items.filter(item => item.verified).length} verified. Source objects retained.`)
  } finally {
    try { await prisma?.$disconnect() } finally {
      await lock.close()
      const { unlink } = await import('node:fs/promises')
      await unlink(`${path}.lock`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Media migration stopped. Check the selected stage, configuration, manifest and source/target access; no source objects were deleted.'); process.exitCode = 1 })
}
