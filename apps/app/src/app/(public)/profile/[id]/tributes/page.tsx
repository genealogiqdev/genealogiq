import { getTranslations } from "next-intl/server"
import { auth } from "@/auth"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { TributesClient } from "@/components/tributes-client"
import { SignupPrompt } from "@/components/auth/signup-prompt"
import { getApprovedTributesByProfileId, getMyUnpublishedTributesForProfile, getTributeCountByProfileId } from "@/queries/tribute"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"

// Anonymous visitors read a generous set of tributes; a scroll-triggered sign-up
// dialog nudges them to join (writing one always needs sign-up).
const ANON_TRIBUTES_LIMIT = 16

interface Props {
  params: Promise<{ id: string }>
}

export default async function TributesPage({ params }: Props) {
  const { id } = await params
  const t = await getTranslations("Tributes")
  const session = await auth()
  const viewerId = session?.user?.id
  const isAnon = !viewerId

  const profile = await getProfileById(id)
  assertPublicMemorialAccess(profile, viewerId, id)

  // Anonymous: a bounded slice of tributes + a cheap total count for the badge / wall
  // trigger. Authed: the full set (the client paginates it).
  const tributes = await getApprovedTributesByProfileId(id, isAnon ? ANON_TRIBUTES_LIMIT : undefined)
  const tributeCount = isAnon ? await getTributeCountByProfileId(id) : tributes.length

  const isExactOwn = viewerId === id
  const canWrite = !isAnon && !isExactOwn
  const unpublishedTributes = viewerId ? await getMyUnpublishedTributesForProfile(viewerId, id) : []

  const isManager = viewerId ? canManageProfile(profile, viewerId) : false

  return (
    <div className="relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />

      <main className="container relative pt-24 pb-32">
        <div className="flex items-center justify-between gap-3 mb-2 animate-fade-in">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <BackButton href={`/profile/${id}`} label={t("backToProfile")} />
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight whitespace-nowrap">{t("title", { name: profile.firstName })}</h1>
            </div>
          </div>
          {tributeCount > 0 && (
            <span className="shrink-0 hidden sm:inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5">
              {t("count", { count: tributeCount })}
            </span>
          )}
        </div>

        <TributesClient
          items={tributes}
          profileId={id}
          sessionUserId={viewerId ?? ""}
          canWrite={canWrite}
          isManager={isManager}
          unpublishedTributes={unpublishedTributes}
        />

      </main>

      {isAnon && <SignupPrompt />}
    </div>
  )
}
