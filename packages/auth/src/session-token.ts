import type { AppPrincipal } from "./types"

/** The JWT payload shape a real login produces — extracted so out-of-band
 *  session-minting code (next-auth/jwt's encode(), called directly instead of
 *  through signIn()) can reuse the exact same shape instead of re-deriving it.
 *  `email`/`sub` are included explicitly here even though a normal login's
 *  token already has them pre-populated by @auth/core before the jwt()
 *  callback below runs — encode() starts from an empty token, so this is the
 *  only place those two fields get set for an out-of-band mint. */
export function buildSessionToken(p: AppPrincipal): Record<string, unknown> {
  return {
    name:  p.name,
    email: p.email,
    sub:   p.id,
    id:    p.id,
    role:  p.role,
    image: p.image ?? null,
    ...(p.customerId !== undefined ? { customerId: p.customerId } : {}),
  }
}
