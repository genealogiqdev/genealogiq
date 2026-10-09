import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { TreeMemorialPicker } from "@/components/tree-memorial-picker"
import { verifySession } from "@/lib/dal"
import { getTreeMemorialCandidates } from "@/queries/tree-memorial"

export default async function MemorialFromTreePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  const { id } = await params
  if (id !== session.user.id) redirect(`/profile/${session.user.id}/memorialized`)

  const [t, profiles] = await Promise.all([
    getTranslations("Memorialized"),
    getTreeMemorialCandidates(session.user.id),
  ])

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="top" />
      <main className="container relative pt-24 pb-32">
        <section className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 md:gap-4">
            <BackButton href={`/profile/${id}/memorialized`} label={t("newPage.backToGuarded")} />
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{t("fromTree.title")}</h1>
          </div>
          <p className="mt-3 text-muted-foreground">{t("fromTree.description")}</p>
        </section>
        <TreeMemorialPicker profiles={profiles} guardianId={session.user.id} />
      </main>
    </div>
  )
}
