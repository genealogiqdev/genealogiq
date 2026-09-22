import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { PetCreateForm } from "@/components/pet-create-form"
import { verifySession } from "@/lib/dal"
import { canManageProfile } from "@/lib/profile"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { getFamilyTree } from "@/queries/family-tree"
import { getProfileById } from "@/queries/profile"

interface Props {
  params: Promise<{ id: string }>
}

export default async function PetNewPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()
  const t = await getTranslations("Pets")
  const tc = await getTranslations("Common")

  const profile = await getProfileById(id)
  if (!profile || !canManageProfile(profile, session.user.id) || profile.role === "APP_PET") {
    redirect(`/profile/${id}/pets`)
  }

  const creationStatus = await getPetCreationStatus(session.user.id)
  if (!creationStatus.allowed) redirect(`/profile/${id}/pets`)

  // Existing tree members this pet can be attached to as owner(s) — pets
  // can't own other pets, so they're excluded from the option list.
  const { persons } = await getFamilyTree(id, { id, canManage: true })
  const ownerOptions = Object.values(persons)
    .filter((p) => p.role !== "APP_PET")
    .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }))
    .sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : a.name.localeCompare(b.name)))

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />

      <main className="container relative pt-24 pb-32">
        <section className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in">
          <div className="bg-transparent">
            <div className="flex items-center gap-3 md:gap-4">
              <BackButton href={`/profile/${id}/pets`} label={t("newPage.backToPets")} />
              <h1 className="text-4xl font-semibold tracking-tight whitespace-nowrap">{t("newPage.title")}</h1>
            </div>
            <p className="text-muted-foreground mt-2 bg-transparent">
              {t("newPage.subtitle")}
            </p>
          </div>
          <Button variant="ghost" asChild className="shrink-0">
            <Link href={`/profile/${id}/pets`}>{tc("cancel")}</Link>
          </Button>
        </section>

        <PetCreateForm ownerId={id} ownerOptions={ownerOptions} />
      </main>
    </div>
  )
}
