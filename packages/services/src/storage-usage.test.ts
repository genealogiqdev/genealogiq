import { describe, it, expect, vi } from 'vitest'
const { prismaMock, getMediaObjectSize } = vi.hoisted(() => ({
  prismaMock: {
    appUser: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    bio: { findUnique: vi.fn() },
    galleryItem: { findMany: vi.fn() },
    geoPlace: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    geolocation: { findUnique: vi.fn() },
    tribute: { findMany: vi.fn() },
    appUserGuardian: { findMany: vi.fn() },
  },
  getMediaObjectSize: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('./media-storage', () => ({ getMediaObjectSize }))
vi.mock('@genealogiq/db', () => ({ prisma: prismaMock }))

import {
  monthlyStorageCostUsd,
  BLOB_USD_PER_GB_MONTH,
  getProfileStorageUsage,
} from './storage-usage'

describe('monthlyStorageCostUsd', () => {
  it('prices a gigabyte at the published Blob rate', () => {
    expect(monthlyStorageCostUsd(1_000_000_000)).toBeCloseTo(BLOB_USD_PER_GB_MONTH, 6)
  })

  // The scenario the trial's economics were sized against: a heavy family at
  // roughly a gigabyte across a year of storage.
  it('keeps a heavy profile well under the unit revenue of an activation', () => {
    const yearly = monthlyStorageCostUsd(1_000_000_000) * 12
    expect(yearly).toBeLessThan(0.4)
  })

  it('is zero for an empty profile', () => {
    expect(monthlyStorageCostUsd(0)).toBe(0)
  })
})

describe('getProfileStorageUsage', () => {
  it('measures distinct URLs referenced by the profile instead of guessing path prefixes', async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ avatarUrl: 'https://media/a.jpg' })
    prismaMock.user.findUnique.mockResolvedValue({ avatarUrl: null, cover_url: null })
    prismaMock.bio.findUnique.mockResolvedValue({
      images: [{ url: 'https://media/a.jpg' }, { url: 'https://media/b.jpg' }],
    })
    prismaMock.galleryItem.findMany.mockResolvedValue([
      { url: 'https://media/c.mp4', poster: 'https://media/d.jpg' },
    ])
    prismaMock.geoPlace.findMany.mockResolvedValue([{ photos: ['https://media/e.jpg'] }])
    prismaMock.document.findMany.mockResolvedValue([{ fileUrl: 'https://media/f.pdf' }])
    prismaMock.geolocation.findUnique.mockResolvedValue({
      photo1: 'https://media/g.jpg',
      photo2: null,
      photo3: null,
    })
    prismaMock.tribute.findMany.mockResolvedValue([{ imageUrl: 'https://media/h.jpg' }])
    getMediaObjectSize.mockResolvedValue(10)

    await expect(getProfileStorageUsage('profile-1')).resolves.toEqual({
      profileId: 'profile-1',
      files: 8,
      bytes: 80,
    })
    expect(getMediaObjectSize).toHaveBeenCalledTimes(8)
  })
})
