import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('@/queries/notifications', () => ({ getActivityPage: vi.fn() }))

import { loadMoreActivity } from './messages.actions'
import { verifySession } from '@/lib/dal'
import { getActivityPage } from '@/queries/notifications'

const cursor = { id: 'activity-20', createdAt: '2026-10-01T12:00:00.000Z' }

beforeEach(() => vi.resetAllMocks())

describe('activity pagination authorization', () => {
  it('uses the authenticated identity and preserves the serializable cursor', async () => {
    vi.mocked(verifySession).mockResolvedValue({ user: { id: 'viewer' } } as never)
    const page = { items: [], nextCursor: null }
    vi.mocked(getActivityPage).mockResolvedValue(page)

    expect(await loadMoreActivity(cursor)).toEqual(page)
    expect(getActivityPage).toHaveBeenCalledWith('viewer', cursor)
  })

  it('does not query private activity when session validation rejects', async () => {
    vi.mocked(verifySession).mockRejectedValue(new Error('session required'))

    await expect(loadMoreActivity(cursor)).rejects.toThrow('session required')
    expect(getActivityPage).not.toHaveBeenCalled()
  })
})
