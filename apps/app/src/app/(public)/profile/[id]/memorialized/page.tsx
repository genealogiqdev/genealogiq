import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { MemorializedClient } from "@/components/memorialized-client"
import { type MiniProfile } from "@/components/profile-mini-card"
import { getProfileGradient } from "@/lib/avatar-color"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { getMemorialsByCreatorId } from "@/queries/memorial"
import { getMemorialFeatures } from "@/lib/subscription"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { UpgradeHint } from "@/components/upgrade-hint"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import type { MemorialRow } from "@/queries/memorial"

interface MiniProfileContext {
  locale: string
  fallbackSubtitle: string
  bornLabel: (date: string) => string
}

function toMiniProfile(m: MemorialRow, ctx: MiniProfileContext): MiniProfile {
  return {
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
    subtitle: m.birthPlace
      ? `${m.birthPlace}${m.birthCountry ? `, ${m.birthCountry}` : ""}`
      : ctx.fallbackSubtitle,
    // status is a discriminator consumed by the shared ProfileMiniCard (not owned here); kept as the literal value
    status: "Memorialized",
    metric: m.deathDate
      ? `✦ ${formatDateShort(m.deathDate, ctx.locale)}`
      : m.birthDate
        ? ctx.bornLabel(formatMonthYear(m.birthDate, ctx.locale))
        : "",
    initials: `${m.firstName[0]}${m.lastName[0]}`.toUpperCase(),
    gradient: getProfileGradient(m.id),
    href: `/profile/${m.id}`,
    avatarUrl: m.avatarUrl,
  }
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemorializedPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()
  const t = await getTranslations("Memorialized")
  const locale = await getLocale()

  const isOwn = id === session.user.id

  const [profile, memorials, creationStatus, petCreationStatus, features] = await Promise.all([
    getProfileById(id),
    getMemorialsByCreatorId(id),
    isOwn ? getMemorialCreationStatus(id) : Promise.resolve(null),
    isOwn ? getPetCreationStatus(id) : Promise.resolve(null),
    isOwn ? getMemorialFeatures(id) : Promise.resolve(null),
  ])
  if (!profile) notFound()

  const atLimit = isOwn && !!creationStatus && !creationStatus.allowed
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
              {/* Wraps on xs (the title is long in pt/es); single line from sm up. */}
              <h1 className="text-4xl font-semibold tracking-tight sm:whitespace-nowrap">{t("listPage.title")}</h1>
            </div>
            {memorials.length > 0 && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5">
                {t("listPage.profileCount", { count: memorials.length })}
              </span>
            )}
          </div>
        </div>

        <MemorializedClient
          profiles={memorials.map((m) => toMiniProfile(m, miniProfileCtx))}
          isOwn={isOwn}
          showCreate={isOwn}
          atLimit={atLimit}
          memorialsMax={creationStatus?.limit ?? 0}
          petAtLimit={isOwn && !!petCreationStatus && !petCreationStatus.allowed}
          petsMax={petCreationStatus?.limit ?? 0}
          tier={currentTier}
          newHref={`/profile/${id}/memorialized/new`}
          newPetHref={`/profile/${id}/pets/new`}
          upgradeHint={atLimit ? <UpgradeHint context="memorialized" currentTier={currentTier} /> : undefined}
        />
      </main>
    </div>
  )
}
