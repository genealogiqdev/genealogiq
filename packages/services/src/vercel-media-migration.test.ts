import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { destinationFor, rewriteItem, verifyIntegrity, type MigrationItem } from './vercel-media-migration'

const item: MigrationItem = {
  reference: { model: 'Document', id: 'd1', field: 'fileUrl', ownerId: 'p1', sourceUrl: 'https://azure.example/media/source.pdf' },
  destinationName: 'documents/profiles/p1/documents/migrated-id',
  destinationUrl: 'https://private.example/documents/new.pdf', size: 3, sha256: 'abc', verified: true,
}
type Db = Parameters<typeof rewriteItem>[0]

describe('Vercel media migration', () => {
  it('separates document copies from public copies even when the old URL is shared', () => {
    const privateName = destinationFor(item.reference)
    const publicName = destinationFor({ ...item.reference, model: 'GalleryItem', field: 'url' })
    expect(privateName).toMatch(/^documents\/profiles\/p1\/documents\/migrated-[a-f0-9]{64}$/)
    expect(publicName).toMatch(/^migration\/[a-f0-9]{64}$/)
    expect(privateName).not.toBe(publicName)
  })
  it.each([{ size: 4, sha256: 'abc' }, { size: 3, sha256: 'different' }])('rejects copied content mismatch', actual => {
    expect(() => verifyIntegrity(item, actual)).toThrow('verification')
  })
  it('requires recorded checksum and size', () => {
    expect(() => verifyIntegrity({ size: null, sha256: null }, { size: 3, sha256: 'abc' })).toThrow()
  })
  it('rewrites a verified scalar only if its original URL still matches', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    await rewriteItem({ document: { updateMany } } as unknown as Db, item)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'd1', fileUrl: 'https://azure.example/media/source.pdf' }, data: { fileUrl: 'https://private.example/documents/new.pdf' } })
  })
  it('rolls back only the recorded destination, preserving replacement uploads', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const findFirst = vi.fn().mockResolvedValue(null)
    await expect(rewriteItem({ document: { updateMany, findFirst } } as unknown as Db, item, true)).rejects.toThrow('Stale')
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'd1', fileUrl: 'https://private.example/documents/new.pdf' }, data: { fileUrl: 'https://azure.example/media/source.pdf' } })
  })
  it('tolerates replay of an already applied reference', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const findFirst = vi.fn().mockResolvedValue({ id: 'd1' })
    await expect(rewriteItem({ document: { updateMany, findFirst } } as unknown as Db, item)).resolves.toBeUndefined()
  })
  it('never writes an unverified item', async () => {
    await expect(rewriteItem({} as Db, { ...item, verified: false })).rejects.toThrow('unverified')
  })
  it('uses compare-and-swap for the whole photos array and preserves unrelated slots', async () => {
    const findUnique = vi.fn().mockResolvedValue({ photos: ['other', item.reference.sourceUrl] })
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    await rewriteItem({ geoPlace: { findUnique, updateMany } } as unknown as Db, { ...item, reference: { ...item.reference, model: 'GeoPlace', field: 'photos', arrayIndex: 1 } })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'd1', photos: { equals: ['other', 'https://azure.example/media/source.pdf'] } }, data: { photos: ['other', 'https://private.example/documents/new.pdf'] } })
  })
  it('rejects an array edited after it was read', async () => {
    const findUnique = vi.fn().mockResolvedValue({ photos: [item.reference.sourceUrl] })
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    await expect(rewriteItem({ geoPlace: { findUnique, updateMany } } as unknown as Db, { ...item, reference: { ...item.reference, model: 'GeoPlace', field: 'photos', arrayIndex: 0 } })).rejects.toThrow('Concurrent')
  })
})
