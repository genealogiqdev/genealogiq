import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  deleteIfExists,
  getProperties,
  downloadToBuffer,
  referenceCount,
  prismaMock,
} = vi.hoisted(() => {
  const referenceCount = vi.fn()
  return {
    deleteIfExists: vi.fn(),
    getProperties: vi.fn(),
    downloadToBuffer: vi.fn(),
    referenceCount,
    prismaMock: {
      user: { count: referenceCount },
      appUser: { count: referenceCount },
      bioImage: { count: referenceCount },
      tribute: { count: referenceCount },
      galleryItem: { count: referenceCount },
      geoPlace: { count: referenceCount },
      document: { count: referenceCount },
      geolocation: { count: referenceCount },
    },
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/db', () => ({ prisma: prismaMock }))
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {},
  ManagedIdentityCredential: class {},
}))
vi.mock('@azure/storage-blob', () => {
  const blob = {
    url: 'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p1/avatar/id.jpg',
    deleteIfExists,
    getProperties,
    downloadToBuffer,
  }
  const container = {
    createIfNotExists: vi.fn(),
    getBlockBlobClient: vi.fn(() => blob),
    getBlobClient: vi.fn(() => blob),
  }
  const client = {
    setProperties: vi.fn(),
    getContainerClient: vi.fn(() => container),
    getUserDelegationKey: vi.fn(),
  }
  return {
    BlobSASPermissions: { parse: vi.fn((value: string) => value) },
    BlobServiceClient: {
      fromConnectionString: vi.fn(() => client),
    },
    generateBlobSASQueryParameters: vi.fn(() => ({ toString: () => 'sig=test' })),
    SASProtocol: { Https: 'https', HttpsAndHttp: 'https,http' },
    StorageSharedKeyCredential: class {},
  }
})

import {
  createAuthorizedUpload,
  completeMediaUpload,
  deleteMediaUrls,
  deleteUnreferencedMediaUrls,
  isAuthorizedMediaReference,
  readMediaUploadBody,
  resetMediaStorageForTests,
} from './media-storage'

const connectionString =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'

beforeEach(() => {
  vi.clearAllMocks()
  referenceCount.mockResolvedValue(0)
  process.env.AZURE_STORAGE_CONNECTION_STRING = connectionString
  process.env.MEDIA_PUBLIC_BASE_URL =
    'http://127.0.0.1:10000/devstoreaccount1/media'
  resetMediaStorageForTests()
})

afterEach(() => {
  delete process.env.AZURE_STORAGE_CONNECTION_STRING
  delete process.env.MEDIA_PUBLIC_BASE_URL
  resetMediaStorageForTests()
})

describe('media upload storage', () => {
  it('parses only the supported upload request shapes', async () => {
    const request = new Request('http://test/upload', {
      method: 'POST',
      body: JSON.stringify({
        type: 'media.upload.authorize',
        file: { name: 'photo.png', type: 'image/png', size: 42 },
        clientPayload: '{"profileId":"p1"}',
      }),
    })

    await expect(readMediaUploadBody(request)).resolves.toEqual({
      type: 'media.upload.authorize',
      file: { name: 'photo.png', type: 'image/png', size: 42 },
      clientPayload: '{"profileId":"p1"}',
    })
  })

  it('rejects disallowed content types before issuing a SAS', async () => {
    await expect(
      createAuthorizedUpload(
        { name: 'payload.exe', type: 'application/octet-stream', size: 20 },
        {
          allowedContentTypes: ['image/png'],
          maximumSizeInBytes: 100,
          prefix: 'profiles/p1/avatar',
        },
      ),
    ).rejects.toThrow('File type is not allowed')
  })

  it('issues an upload constrained to the authorized prefix', async () => {
    const result = await createAuthorizedUpload(
      { name: 'photo.png', type: 'image/png', size: 20 },
      {
        allowedContentTypes: ['image/png'],
        maximumSizeInBytes: 100,
        prefix: 'profiles/p1/avatar',
      },
    )

    expect(result.url).toMatch(
      /^http:\/\/127\.0\.0\.1:10000\/devstoreaccount1\/media\/profiles\/p1\/avatar\//,
    )
    expect(result.uploadUrl).toContain('sig=test')
    expect(result.headers['x-ms-blob-type']).toBe('BlockBlob')
  })

  it('verifies size, type, signature, and ownership on completion', async () => {
    getProperties.mockResolvedValue({ contentLength: 12, contentType: 'image/png' })
    downloadToBuffer.mockResolvedValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )

    await expect(
      completeMediaUpload(
        'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p1/avatar/id.jpg',
        {
          allowedContentTypes: ['image/png'],
          maximumSizeInBytes: 100,
          prefix: 'profiles/p1/avatar',
        },
      ),
    ).resolves.toEqual({
      url: 'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p1/avatar/id.jpg',
      size: 12,
      contentType: 'image/png',
    })
  })

  it('leaves legacy Vercel objects untouched after cutover', async () => {
    await deleteMediaUrls([
      'https://legacy.public.blob.vercel-storage.com/gallery/photo.jpg',
    ])
    expect(deleteIfExists).not.toHaveBeenCalled()
  })

  it('does not delete a media URL while another database record references it', async () => {
    referenceCount.mockResolvedValueOnce(1)
    await deleteUnreferencedMediaUrls([
      'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p1/shared/photo.jpg',
    ])
    expect(deleteIfExists).not.toHaveBeenCalled()
  })

  it('pins persisted Azure media to the authorized object prefix', () => {
    expect(isAuthorizedMediaReference(
      'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p1/avatar/photo.jpg',
      ['profiles/p1/avatar'],
      { allowLegacy: false },
    )).toBe(true)
    expect(isAuthorizedMediaReference(
      'http://127.0.0.1:10000/devstoreaccount1/media/profiles/p2/avatar/photo.jpg',
      ['profiles/p1/avatar'],
      { allowLegacy: false },
    )).toBe(false)
    expect(isAuthorizedMediaReference(
      'https://legacy.public.blob.vercel-storage.com/photo.jpg',
      ['profiles/p1/avatar'],
      { allowLegacy: false },
    )).toBe(false)
  })
})
