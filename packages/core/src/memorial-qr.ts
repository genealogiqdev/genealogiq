export interface MemorialQrPlan {
  code: string
  memorialsMax: number
  petsMax: number
  qrCodeMax: number
}

export interface GuardedQrProfile {
  id: string
  role: string
  createdAt: Date
  genCode: { id: string } | null
}

export interface MemorialQrStatus {
  unlocked: boolean
  rank: number
  limit: number
}

/** Callers must supply only the customer's ACCEPTED guardianships. */
export function getMemorialQrStatus(
  profiles: readonly GuardedQrProfile[],
  profileId: string,
  plan: MemorialQrPlan,
  extraQrCodes = 0,
): MemorialQrStatus {
  const profile = profiles.find((item) => item.id === profileId)
  if (!profile || !['APP_MEMO', 'APP_PET'].includes(profile.role)) {
    return { unlocked: false, rank: 0, limit: 0 }
  }

  const isPet = profile.role === 'APP_PET'
  // Premium includes a QR for each of its human/pet slots. The personal QR
  // allowance is separate. Preserve custom plans and purchased human QR slots.
  const included = plan.code === 'PREMIUM'
    ? isPet ? plan.petsMax : plan.memorialsMax
    : isPet || plan.code === 'FREE' ? 0 : Math.max(0, plan.qrCodeMax - 1)
  const limit = included + (isPet ? 0 : extraQrCodes)

  // An activated plaque keeps its own entitlement and consumes no plan slot.
  if (profile.genCode) return { unlocked: true, rank: 0, limit }

  const ranked = profiles
    .filter((item) => item.role === profile.role && !item.genCode)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const rank = ranked.findIndex((item) => item.id === profileId) + 1
  return { unlocked: rank > 0 && rank <= limit, rank, limit }
}
