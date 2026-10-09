import { describe, expect, it } from 'vitest'
import { getMemorialQrStatus, type GuardedQrProfile } from './memorial-qr'

const premium = { code: 'PREMIUM', memorialsMax: 5, petsMax: 5, qrCodeMax: 1 }
const free = { code: 'FREE', memorialsMax: 1, petsMax: 0, qrCodeMax: 1 }
const profile = (id: string, role = 'APP_MEMO', day = 1): GuardedQrProfile => ({
  id, role, createdAt: new Date(Date.UTC(2026, 9, day)), genCode: null,
})

describe('memorial GenCodes included in the consumer plan', () => {
  it('keeps the Free memorial locked even when it is the oldest profile', () => {
    expect(getMemorialQrStatus([profile('human')], 'human', free)).toEqual({ unlocked: false, rank: 1, limit: 0 })
  })

  it('includes five human and five pet QRs, with independent sixth-profile boundaries', () => {
    const profiles = [1, 2, 3, 4, 5, 6].flatMap((day) => [profile(`human-${day}`, 'APP_MEMO', day), profile(`pet-${day}`, 'APP_PET', day)])
    expect(getMemorialQrStatus(profiles, 'human-5', premium)).toEqual({ unlocked: true, rank: 5, limit: 5 })
    expect(getMemorialQrStatus(profiles, 'pet-5', premium)).toEqual({ unlocked: true, rank: 5, limit: 5 })
    expect(getMemorialQrStatus(profiles, 'human-6', premium)).toEqual({ unlocked: false, rank: 6, limit: 5 })
    expect(getMemorialQrStatus(profiles, 'pet-6', premium)).toEqual({ unlocked: false, rank: 6, limit: 5 })
  })

  it('honors configured quotas without treating the personal QR as a memorial', () => {
    const profiles = [profile('self', 'APP_USER'), profile('h1'), profile('h2'), profile('h3')]
    expect(getMemorialQrStatus(profiles, 'h2', { ...premium, memorialsMax: 2 })).toEqual({ unlocked: true, rank: 2, limit: 2 })
    expect(getMemorialQrStatus(profiles, 'h3', { ...premium, memorialsMax: 2 }).unlocked).toBe(false)
    expect(getMemorialQrStatus(profiles, 'self', premium).unlocked).toBe(false)
  })

  it('preserves activated plaques without consuming included slots', () => {
    const profiles = [profile('a'), { ...profile('licensed'), genCode: { id: 'physical-code' } }, profile('b')]
    expect(getMemorialQrStatus(profiles, 'licensed', free)).toEqual({ unlocked: true, rank: 0, limit: 0 })
    expect(getMemorialQrStatus(profiles, 'b', { ...premium, memorialsMax: 2 })).toEqual({ unlocked: true, rank: 2, limit: 2 })
  })

  it('preserves purchased human QR units without granting a pet allowance', () => {
    const profiles = [profile('human'), profile('pet', 'APP_PET')]
    expect(getMemorialQrStatus(profiles, 'human', free, 1)).toEqual({ unlocked: true, rank: 1, limit: 1 })
    expect(getMemorialQrStatus(profiles, 'pet', free, 1)).toEqual({ unlocked: false, rank: 1, limit: 0 })
  })

  it('rejects unrelated profiles even when plenty of slots remain', () => {
    expect(getMemorialQrStatus([profile('human')], 'foreign', premium)).toEqual({ unlocked: false, rank: 0, limit: 0 })
    expect(getMemorialQrStatus([profile('ghost', 'APP_GHOST')], 'ghost', premium).unlocked).toBe(false)
  })

  it('uses creation time and a stable ID tie-break without changing the input order', () => {
    const profiles = [profile('b'), profile('a'), profile('oldest', 'APP_MEMO', 0)]
    expect(getMemorialQrStatus(profiles, 'a', premium).rank).toBe(2)
    expect(getMemorialQrStatus(profiles, 'b', premium).rank).toBe(3)
    expect(profiles.map((item) => item.id)).toEqual(['b', 'a', 'oldest'])
  })

  it('retains the QR allowance of a custom plan', () => {
    const custom = { ...free, code: 'CUSTOM', qrCodeMax: 3 }
    const profiles = [profile('a'), profile('b'), profile('c')]
    expect(getMemorialQrStatus(profiles, 'b', custom)).toEqual({ unlocked: true, rank: 2, limit: 2 })
    expect(getMemorialQrStatus(profiles, 'c', custom).unlocked).toBe(false)
  })
})
