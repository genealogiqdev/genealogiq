import { describe, expect, it } from 'vitest'
import {
  isReferencedObjectReadyForRewrite,
  legacyDestinationName,
  replaceMediaArray,
} from './media-migration-helpers'

describe('legacyDestinationName', () => {
  it('is deterministic and preserves a safe source filename', () => {
    const source = 'https://store.public.blob.vercel-storage.com/gallery/family photo.jpg'
    expect(legacyDestinationName(source, 'gallery/family photo.jpg')).toBe(
      legacyDestinationName(source, 'gallery/family photo.jpg'),
    )
    expect(legacyDestinationName(source, 'gallery/family photo.jpg')).toMatch(
      /^legacy\/[a-f0-9]{20}\/family_photo\.jpg$/,
    )
  })

  it('does not collide for different source URLs with the same filename', () => {
    const left = legacyDestinationName('https://one.example/photo.jpg', 'photo.jpg')
    const right = legacyDestinationName('https://two.example/photo.jpg', 'photo.jpg')
    expect(left).not.toBe(right)
  })
})

describe('replaceMediaArray', () => {
  it('preserves order and replaces only mapped URLs', () => {
    const result = replaceMediaArray(
      ['old-a', 'keep', 'old-b'],
      new Map([['old-a', 'new-a'], ['old-b', 'new-b']]),
    )
    expect(result).toEqual({
      changed: true,
      value: ['new-a', 'keep', 'new-b'],
    })
  })

  it('is idempotent after migration', () => {
    const replacements = new Map([['old', 'new']])
    expect(replaceMediaArray(['new'], replacements)).toEqual({
      changed: false,
      value: ['new'],
    })
  })
})

describe('isReferencedObjectReadyForRewrite', () => {
  const ready = {
    references: [{}],
    destinationUrl: 'https://media/object',
    copiedAt: '2026-09-25T00:00:00.000Z',
    verifiedAt: '2026-09-25T00:01:00.000Z',
    errors: [],
  }

  it('requires copied and verified referenced objects with no errors', () => {
    expect(isReferencedObjectReadyForRewrite(ready)).toBe(true)
    expect(isReferencedObjectReadyForRewrite({ ...ready, verifiedAt: null })).toBe(false)
    expect(isReferencedObjectReadyForRewrite({ ...ready, errors: ['verify: mismatch'] })).toBe(false)
  })

  it('does not block on unreferenced legacy objects', () => {
    expect(isReferencedObjectReadyForRewrite({
      ...ready,
      references: [],
      destinationUrl: null,
      copiedAt: null,
      verifiedAt: null,
    })).toBe(true)
  })
})
