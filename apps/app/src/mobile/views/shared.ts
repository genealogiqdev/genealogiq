import "server-only"

import { notFound } from "next/navigation"
import { ForbiddenError } from "@genealogiq/auth/authz"
import type { MobileParams } from "@genealogiq/auth/mobile"
import { auth } from "@/auth"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"
import { getProfileById, type ProfileRow } from "@/queries/profile"
import type { ActivePlan } from "@/queries/billing"

/**
 * Mobile views mirror one web page each. They reuse the page's own guard:
 * `verifySession()` (401 through the sign-in redirect) for protected screens,
 * `assertPublicMemorialAccess()` for the screens the web also serves to
 * anonymous visitors. Where a web page redirects a signed-in non-manager away
 * from an edit screen, the view answers 403 instead of a redirect.
 */

/** Same optional-session read the public pages use: undefined for a visitor. */
export async function optionalViewerId(): Promise<string | undefined> {
  const session = await auth()
  return session?.user?.id
}

/** A required route segment (`/profile/[id]`); a missing one is a 404, as on the web. */
export function requireParam(params: MobileParams, key: string): string {
  const value = params[key]?.trim()
  if (!value) notFound()
  return value
}

export function optionalParam(params: MobileParams, key: string): string | undefined {
  const value = params[key]?.trim()
  return value ? value : undefined
}

/** Signed in, but not allowed to manage this resource. */
export function deny(): never {
  throw new ForbiddenError()
}

export interface PublicProfileContext {
  profile: ProfileRow
  viewerId: string | undefined
  isAnon: boolean
  /** Owner or ACCEPTED guardian — the pages call this `isOwn`. */
  canManage: boolean
}

/** The shared head of every public profile sub-page. */
export async function loadPublicProfile(id: string): Promise<PublicProfileContext> {
  const viewerId = await optionalViewerId()
  const profile = await getProfileById(id)
  assertPublicMemorialAccess(profile, viewerId, id)
  return {
    profile,
    viewerId,
    isAnon: !viewerId,
    canManage: viewerId ? canManageProfile(profile, viewerId) : false,
  }
}

/** The shared head of every manager-only edit page: 401, then 404, then 403. */
export async function loadManagedProfile(id: string, viewerId: string): Promise<ProfileRow> {
  const profile = await getProfileById(id)
  if (!profile) notFound()
  if (!canManageProfile(profile, viewerId)) deny()
  return profile
}

/** What the plan banner and the plan grid read; no Stripe identifiers. */
export function toPlanSummary(plan: ActivePlan | null) {
  if (!plan) return null
  return {
    id: plan.id,
    cadence: plan.cadence,
    currency: plan.currency,
    status: plan.status,
    currentPeriodEnd: plan.currentPeriodEnd,
    cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
    // The four banner variants of the subscriptions page, in its precedence.
    state: plan.consumerAccessGrant
      ? ("gift" as const)
      : plan.couponRedemption
        ? ("manual" as const)
        : plan.cancelAtPeriodEnd
          ? ("canceling" as const)
          : ("active" as const),
    /** The "manage subscription" (Stripe portal) button is offered. */
    canManageBilling: !!plan.stripeSubscriptionId,
    subscription: plan.subscription,
  }
}

interface CardSource {
  id: string
  firstName: string
  lastName?: string | null
  avatarUrl: string | null
  role: string
  birthDate?: Date | null
  birthPlace?: string | null
  birthCountry?: string | null
  deathDate?: Date | null
  deathPlace?: string | null
  deathCountry?: string | null
  birthYear?: number | null
  deathYear?: number | null
  petSpecies?: string | null
  petBreed?: string | null
}

/** A profile as a list card. Callers pass rows that are already redacted. */
export function toProfileCard(row: CardSource) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName ?? "",
    avatarUrl: row.avatarUrl,
    role: row.role,
    birthDate: row.birthDate ?? null,
    birthPlace: row.birthPlace ?? null,
    birthCountry: row.birthCountry ?? null,
    deathDate: row.deathDate ?? null,
    deathPlace: row.deathPlace ?? null,
    deathCountry: row.deathCountry ?? null,
    birthYear: row.birthYear ?? (row.birthDate ? row.birthDate.getUTCFullYear() : null),
    deathYear: row.deathYear ?? (row.deathDate ? row.deathDate.getUTCFullYear() : null),
    petSpecies: row.petSpecies ?? null,
    petBreed: row.petBreed ?? null,
  }
}
