import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), document: vi.fn(), profile: vi.fn(), read: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { document: { findUnique: mocks.document }, appUser: { findUnique: mocks.profile } } }))
vi.mock('@genealogiq/services/media-storage', () => ({ isPrivateVercelDocumentUrl: () => true, readPrivateDocument: mocks.read }))
import { GET } from './route'

const call = () => GET(new Request('http://localhost/api/documents/d1/file'), { params: Promise.resolve({ id: 'd1' }) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } })
  mocks.document.mockResolvedValue({ id: 'd1', userId: 'owner', isPublic: false, fileUrl: 'private-object' })
  mocks.profile.mockResolvedValue({ id: 'owner', guardedBy: [] })
  mocks.read.mockImplementation(() => Promise.resolve({ stream: new Response('%PDF-1.7').body }))
})

describe('document byte authorization', () => {
  it('denies anonymous requests without fetching a row or bytes', async () => {
    mocks.auth.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(mocks.document).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('streams the owner PDF without allowing shared caching', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('%PDF-1.7')
  })
  it('denies an unrelated user for a private document', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'unrelated' } })
    expect((await call()).status).toBe(404)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('allows an accepted guardian and queries only accepted relationships', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'guardian' } })
    mocks.profile.mockResolvedValue({ id: 'owner', guardedBy: [{ guardianId: 'guardian', status: 'ACCEPTED' }] })
    expect((await call()).status).toBe(200)
    expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ guardedBy: expect.objectContaining({ where: { status: 'ACCEPTED' } }) }) }))
  })
  it('denies a pending guardian even if a query unexpectedly includes it', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'guardian' } })
    mocks.profile.mockResolvedValue({ id: 'owner', guardedBy: [{ guardianId: 'guardian', status: 'PENDING' }] })
    expect((await call()).status).toBe(404)
  })
  it('allows another signed-in user only while the document is public', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'viewer' } })
    mocks.document.mockResolvedValueOnce({ id: 'd1', userId: 'owner', isPublic: true, fileUrl: 'private-object' })
    expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(404)
  })
  it('reports a storage failure without returning a private URL', async () => {
    mocks.read.mockRejectedValue(new Error('provider secret'))
    const response = await call()
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
  })
})
