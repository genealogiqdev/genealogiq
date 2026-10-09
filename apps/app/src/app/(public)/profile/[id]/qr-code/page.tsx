import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { QrCodeClient } from "@/components/qr-code-client"
import { QrLockedCard } from "@/components/qr-locked-card"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { getQrQuotaStatus } from "@/lib/qr-quota"
import { getMemorialFeatures } from "@/lib/subscription"

interface Props {
  params: Promise<{ id: string }>
}

export default async function QrCodePage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()
  const t = await getTranslations("Qr")

  const profile = await getProfileById(id)
  if (!profile) notFound()

  // Pet exports now live on the profile with a live Premium check per download.
  if (profile.role === "APP_PET") redirect(`/profile/${profile.id}`)

  const isGuardian = profile.role === "APP_MEMO" && profile.guardedBy.some((g) => g.guardianId === session.user.id)

  // A memorial's QR Code is accessible only to its guardian(s).
  if (profile.role === "APP_MEMO" && !isGuardian) notFound()

  // Memorial QR exports use the viewing guardian's plan, independently of
  // their personal QR allowance and any other co-guardian's subscription.
  const quotaGuardianId = profile.role === "APP_MEMO" ? session.user.id : profile.id
  const [quota, features] = await Promise.all([
    getQrQuotaStatus(quotaGuardianId, profile.id),
    getMemorialFeatures(quotaGuardianId),
  ])

  const appUrl = process.env.APP_URL ?? "https://genealogiq.app"
  const profileUrl = `${appUrl}/profile/${id}`

  return (
    <div className="relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />

      <main className="container relative pt-24 pb-32">
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <BackButton href={`/profile/${id}`} label={t("profilePage.backToProfile")} />
              <h1 className="text-4xl font-semibold tracking-tight whitespace-nowrap">{t("profilePage.title")}</h1>
            </div>
          </div>
          <p className="text-muted-foreground mt-2 italic">
            {t("profilePage.subtitle")}
          </p>
        </div>

        {quota.unlocked ? (
          <QrCodeClient profileUrl={profileUrl} />
        ) : (
          <QrLockedCard limit={quota.limit} tier={features.code} memorialQr={profile.role === 'APP_MEMO'} />
        )}
      </main>
    </div>
  )
}
