import 'server-only'

import { headers } from 'next/headers'
import { prisma } from '@genealogiq/db'

export async function getClientIp(): Promise<string> {
  const h   = await headers()
  const xff = h.get('x-forwarded-for')
  // Azure Container Apps appends its ingress value to X-Forwarded-For. Only
  // the rightmost value is guaranteed by the platform; client-supplied values
  // to its left are untrusted.
  if (xff) {
    const addresses = xff.split(',').map((value) => value.trim()).filter(Boolean)
    if (addresses.length > 0) return addresses[addresses.length - 1]
  }
  return h.get('x-real-ip') ?? 'unknown'
}

interface CheckRateLimitOpts {
  key:           string
  maxAttempts:   number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed:    boolean
  retryAfter: number
}

// Sliding-window check + record. Returns `allowed: false` if the caller has
// already made `maxAttempts` requests within the trailing window — the caller
// should bail before doing the expensive work. Best-effort opportunistic
// cleanup runs on ~1% of checks to bound table growth.
export async function checkRateLimit({
  key,
  maxAttempts,
  windowSeconds,
}: CheckRateLimitOpts): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSeconds * 1000)

  const recent = await prisma.rateLimitAttempt.findMany({
    where:   { key, attemptedAt: { gte: since } },
    orderBy: { attemptedAt: 'asc' },
    take:    maxAttempts,
    select:  { attemptedAt: true },
  })

  if (recent.length >= maxAttempts) {
    const oldest     = recent[0].attemptedAt
    const retryAfter = Math.max(1, Math.ceil((oldest.getTime() + windowSeconds * 1000 - Date.now()) / 1000))
    return { allowed: false, retryAfter }
  }

  await prisma.rateLimitAttempt.create({ data: { key } })

  if (Math.random() < 0.01) {
    await prisma.rateLimitAttempt
      .deleteMany({ where: { attemptedAt: { lt: new Date(Date.now() - 3600 * 1000) } } })
      .catch(() => {})
  }

  return { allowed: true, retryAfter: 0 }
}

/**
 * 429 error thrown by requireWithinRateLimit. Carries retry-after (seconds) so
 * callers can surface it. Defined here (the lower package) and re-exported through
 * @genealogiq/auth's authz barrel to keep the auth→services dependency acyclic.
 */
export class TooManyRequestsError extends Error {
  readonly status = 429
  constructor(
    public readonly retryAfter: number,
    message = 'Too many requests',
  ) {
    super(message)
    this.name = 'TooManyRequestsError'
  }
}

/**
 * Throwing guard over checkRateLimit (régua contract). Throws
 * TooManyRequestsError(retryAfter) on breach.
 *
 * - In a form-invoked Server Action, wrap in try/catch and convert to `{ error }`
 *   (forms expect a result, not a thrown navigation).
 * - In an HTTP route handler, map the thrown error to a 429 response.
 */
export async function requireWithinRateLimit(
  key: string,
  opts: { limit: number; windowSec: number; message?: string },
): Promise<void> {
  const { allowed, retryAfter } = await checkRateLimit({
    key,
    maxAttempts:   opts.limit,
    windowSeconds: opts.windowSec,
  })
  if (!allowed) throw new TooManyRequestsError(retryAfter, opts.message)
}
