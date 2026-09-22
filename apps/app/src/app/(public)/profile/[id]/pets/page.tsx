import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { PetsClient } from "@/components/pets-client"
import { type MiniProfile } from "@/components/profile-mini-card"
import { getProfileGradient } from "@/lib/avatar-color"
import { auth } from "@/auth"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"
import { getProfileById } from "@/queries/profile"
import { getPetsByOwnerId } from "@/queries/pet"
import { getMemorialFeatures } from "@/lib/subscription"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { UpgradeHint } from "@/components/upgrade-hint"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import type { PetRow } from "@/queries/pet"

interface MiniProfileContext {
  locale: string
  fallbackSubtitle: string
  bornLabel: (date: string) => string
}

function toMiniProfile(p: PetRow, ctx: MiniProfileContext): MiniProfile {
  return {
    id: p.id,
    name: p.firstName,
    subtitle: [p.petBreed, p.petSpecies].filter(Boolean).join(", ") || ctx.fallbackSubtitle,
    status: "Pet",
    metric: p.deathDate
      ? `✦ ${formatDateShort(p.deathDate, ctx.locale)}`
      : p.birthDate
        ? ctx.bornLabel(formatMonthYear(p.birthDate, ctx.locale))
        : "",
    initials: p.firstName.slice(0, 2).toUpperCase(),
    gradient: getProfileGradient(p.id),
    href: `/profile/${p.id}`,
    avatarUrl: p.avatarUrl,
  }
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function PetsPage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  const viewerId = session?.user?.id
  const t = await getTranslations("Pets")
  const locale = await getLocale()

  const profile = await getProfileById(id)
  assertPublicMemorialAccess(profile, viewerId, id)
  if (profile.role === "APP_PET" || profile.role === "APP_GHOST") notFound()
  const canManage = viewerId ? canManageProfile(profile, viewerId) : false

  const [pets, creationStatus, features] = await Promise.all([
    getPetsByOwnerId(id),
    canManage && viewerId ? getPetCreationStatus(viewerId) : Promise.resolve(null),
    canManage && viewerId ? getMemorialFeatures(viewerId) : Promise.resolve(null),
  ])

  const atLimit = canManage && !!creationStatus && !creationStatus.allowed
  const currentTier = features?.code ?? "FREE"

  const miniProfileCtx: MiniProfileContext = {
    locale,
    fallbackSubtitle: t("card.fallbackSubtitle"),
    bornLabel: (date) => t("card.born", { date }),
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="top" />

      <main className="container relative pt-24 pb-32">
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <BackButton href={`/profile/${id}`} label={t("listPage.backToProfile")} />
              <h1 className="text-4xl font-semibold tracking-tight sm:whitespace-nowrap">{t("listPage.title")}</h1>
            </div>
            {pets.length > 0 && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5">
                {t("listPage.profileCount", { count: pets.length })}
              </span>
            )}
          </div>
        </div>

        <PetsClient
          profiles={pets.map((p) => toMiniProfile(p, miniProfileCtx))}
          isOwn={canManage}
          showCreate={canManage}
          atLimit={atLimit}
          petsMax={creationStatus?.limit ?? 0}
          tier={currentTier}
          newHref={`/profile/${id}/pets/new`}
          upgradeHint={atLimit ? <UpgradeHint context="pets" currentTier={currentTier} /> : undefined}
        />
      </main>
    </div>
  )
}
