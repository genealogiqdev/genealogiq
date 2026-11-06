import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { canActivate } from "@genealogiq/services/credits"
import { auth } from "@/auth"
import { getLicenseByGenCode } from "@/queries/gencode"
import { GenCodeLanding } from "@/components/qr/gencode-landing"
import { ActivateMemorialForm } from "@/components/qr/activate-memorial-form"
import { AuroraBackdrop } from "@/components/aurora-backdrop"

interface Props {
  params: Promise<{ genCode: string }>
}

export default async function GenCodePage({ params }: Props) {
  const { genCode: rawGenCode } = await params
  const normalized = rawGenCode.toUpperCase().replace(/-/g, "")

  const [session, license, t] = await Promise.all([
    auth(),
    getLicenseByGenCode(normalized),
    getTranslations("Qr"),
  ])

  if (!license) notFound()

  if (license.status === "ACTIVATED") {
    redirect(`/profile/${license.appUserId}`)
  }

  if (license.businessSaleId && license.soldToAppUserId && session?.user && license.soldToAppUserId !== session.user.id) {
    return <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />
      <main className="container relative z-10 pt-24 pb-32">
        <h1 className="text-4xl font-extrabold tracking-tight">{t('reseller.title')}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose">{t('reseller.body')}</p>
      </main>
    </div>
  }

  // The partner's allowance may have run out, or their subscription may be
  // frozen while they are behind on an instalment. Checked here as well as in
  // the action so the family gets a page that explains itself instead of a form
  // that fails on submit — they are holding a physical plaque and did nothing
  // wrong. A code sold to an identified buyer carries its own committed credit
  // and passes this even when the partner's cycle is long gone.
  if (!(await canActivate(license.tenantId, license.id))) {
    return (
      <div className="min-h-screen relative overflow-x-hidden">
        <AuroraBackdrop variant="page" intensity="bold" />
        <main className="container relative z-10 pt-24 pb-32">
          <h1 className="text-4xl font-extrabold tracking-tight">{t("expired.title")}</h1>
          <p className="text-muted-foreground mt-2 max-w-prose">{t("expired.body")}</p>
        </main>
      </div>
    )
  }

  // AVAILABLE
  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />
      <main className="container relative z-10 pt-24 pb-32">
        {session?.user ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">{t("activatePage.title")}</h1>
              <p className="text-muted-foreground mt-2">
                {t("activatePage.subtitle")}
              </p>
            </div>
            <ActivateMemorialForm genCode={normalized} />
          </div>
        ) : (
          <GenCodeLanding genCode={normalized} />
        )}
      </main>
    </div>
  )
}
