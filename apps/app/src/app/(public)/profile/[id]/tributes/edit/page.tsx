import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { TributeForm } from "@/components/tribute-form"
import { verifySession } from "@/lib/dal"
import { getMyTributeForProfile } from "@/queries/tribute"
import { getProfileById } from "@/queries/profile"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tributeId?: string | string[] }>
}

export default async function TributeWritePage({ params, searchParams }: Props) {
  const { id } = await params
  const { tributeId } = await searchParams
  if (tributeId !== undefined && (typeof tributeId !== "string" || !tributeId)) notFound()
  const t = await getTranslations("Tributes")
  const tc = await getTranslations("Common")
  const session = await verifySession()

  if (id === session.user.id) redirect(`/profile/${id}/tributes`)

  const [profile, existing] = await Promise.all([
    getProfileById(id),
    tributeId ? getMyTributeForProfile(session.user.id, id, tributeId) : Promise.resolve(null),
  ])
  if (!profile || (tributeId && !existing)) notFound()

  const isEditing = !!existing
  const authorName = session.user.name ?? t("form.youFallback")

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />

      <main className="container relative pt-24 pb-32">
        <section className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in">
          <div className="bg-transparent">
            <div className="flex items-center gap-3 md:gap-4">
              <BackButton href={`/profile/${id}/tributes`} label={t("backToTributes")} />
              <h1 className="text-4xl font-semibold tracking-tight whitespace-nowrap">
                {isEditing ? t("list.editYourTribute") : t("list.sendATribute")}
              </h1>
            </div>
            <p className="text-muted-foreground mt-2 bg-transparent">{t("edit.subtitle")}</p>
          </div>
          <Button variant="ghost" asChild className="shrink-0">
            <Link href={`/profile/${id}/tributes`}>{tc("cancel")}</Link>
          </Button>
        </section>

        <TributeForm
          key={existing?.id ?? "new"}
          profileId={id}
          authorName={authorName}
          existing={existing ? { id: existing.id, text: existing.text, imageUrl: existing.imageUrl } : null}
        />
      </main>
    </div>
  )
}
