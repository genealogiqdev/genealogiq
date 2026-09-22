import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"
import { countTreeMembers, getFamilyTree, getNodePositions } from "@/queries/family-tree"
import { getPetOwners } from "@/queries/pet"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { computeLayout } from "@/components/family-tree/canvas/layout"
import { FamilyTreeCanvas } from "@/components/family-tree/canvas/family-tree-canvas"
import { TreeHeader } from "@/components/family-tree/header/tree-header"
import { AuroraBackdrop } from "@/components/aurora-backdrop"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ focus?: string }>
}

export default async function TreePage({ params, searchParams }: Props) {
  const { id } = await params
  const { focus } = await searchParams
  const session = await auth()
  const viewerId = session?.user?.id

  const profile = await getProfileById(id)
  assertPublicMemorialAccess(profile, viewerId, id)
  if (profile.role === "APP_PET") {
    const [firstOwnership] = await getPetOwners(id)
    if (!firstOwnership) notFound()
    redirect(`/profile/${firstOwnership.ownerId}/tree?focus=${id}`)
  }

  const canManage = viewerId ? canManageProfile(profile, viewerId) : false

  const [{ persons, relations, petOwnerships }, features, initialPositions, memberCount, petCreationStatus] = await Promise.all([
    getFamilyTree(id, { id: viewerId ?? null, canManage }),
    getMemorialFeatures(id),
    getNodePositions(id),
    countTreeMembers(id),
    canManage && viewerId ? getPetCreationStatus(viewerId) : Promise.resolve(null),
  ])
  // Anonymous visitors view the tree read-only, so no guardian lookup is needed.
  const guardianRows = viewerId
    ? await prisma.appUserGuardian.findMany({
        where:  { guardianId: viewerId },
        select: { appUserId: true, status: true },
      })
    : []

  // Sets of person ids the session user can edit (ACCEPTED guardian or self)
  // and those with a pending co-management request from the session user.
  const managedIds   = new Set<string>(viewerId ? [viewerId] : [])
  const requestedIds = new Set<string>()
  for (const g of guardianRows) {
    if (g.status === "ACCEPTED") managedIds.add(g.appUserId)
    else if (g.status === "PENDING") requestedIds.add(g.appUserId)
  }

  // Layout once on the server purely to extract generation count for the header
  // (the client recomputes its own positions; this is just metadata).
  const { generation } = computeLayout(persons, relations, id, new Set(), petOwnerships)

  const petCount = new Set(petOwnerships.map((ownership) => ownership.petId)).size
  const memberLimit = features.treeMaxMembers

  // Existing parents of the root, so the header dialog can offer the
  // "Married to X" checkbox when adding a 2nd parent.
  const rootParents = relations
    .filter((r) => r.type === "PARENT_OF" && r.toId === id)
    .map((r) => {
      const p = persons[r.fromId]
      return p ? { id: p.id, name: `${p.firstName} ${p.lastName}` } : null
    })
    .filter((p): p is { id: string; name: string } => p !== null)

  return (
    <div className="fixed top-16 inset-x-0 bottom-0 flex flex-col">
      <AuroraBackdrop />

      <TreeHeader
        rootFirstName={profile.firstName}
        rootId={id}
        persons={persons}
        generations={generation}
        memberCount={memberCount}
        memberLimit={memberLimit}
        currentTier={features.code}
        canManage={canManage}
        petCount={petCount}
        managedPetCount={petCreationStatus?.count ?? 0}
        petLimit={petCreationStatus?.limit ?? features.petsMax}
        petAtLimit={petCreationStatus ? !petCreationStatus.allowed : true}
        rootParents={rootParents}
      />

      <div className="flex-1 relative">
        <FamilyTreeCanvas
          persons={persons}
          relations={relations}
          petOwnerships={petOwnerships}
          rootId={id}
          focusId={focus}
          sessionUserId={viewerId ?? ""}
          canManage={canManage}
          managedIds={Array.from(managedIds)}
          requestedIds={Array.from(requestedIds)}
          initialPositions={initialPositions}
          memberCount={memberCount}
          memberLimit={memberLimit}
          petCount={petCreationStatus?.count ?? 0}
          petLimit={petCreationStatus?.limit ?? features.petsMax}
          petAtLimit={petCreationStatus ? !petCreationStatus.allowed : true}
          currentTier={features.code}
        />
      </div>
    </div>
  )
}
