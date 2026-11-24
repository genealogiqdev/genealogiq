import "server-only"

import { notFound } from "next/navigation"
import type { MobileView } from "@genealogiq/auth/mobile"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { getQrQuotaStatus } from "@/lib/qr-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { getBioByUserId } from "@/queries/bio"
import { getDocumentsByUserId, getDocumentsCount } from "@/queries/documents"
import { countTreeMembers, getFamilyTree } from "@/queries/family-tree"
import { getFavoriteCount, getFavoritesByUserId, isFavoritedByUser } from "@/queries/favorite"
import { getGalleryCount, getGalleryHasVideos, getGalleryImageUrls } from "@/queries/gallery"
import { getGeolocationForViewer } from "@/queries/geolocation"
import { getGuardedProfilesByGuardianId } from "@/queries/memorial"
import { getPetOwners, getPetsByOwnerId } from "@/queries/pet"
import { getPlacesForMap } from "@/queries/places"
import { getProfileById, getProfileForEdit, redactLivingProfile } from "@/queries/profile"
import { getTreeMemorialCandidates } from "@/queries/tree-memorial"
import { getTributeAuthors, getTributeCountByProfileId } from "@/queries/tribute"
import { deny, loadPublicProfile, optionalParam, optionalViewerId, requireParam, toProfileCard } from "./shared"

/** The viewer's own guardianship rows — same inline query the tree page runs. */
function getGuardianRows(viewerId: string) {
  return prisma.appUserGuardian.findMany({
    where: { guardianId: viewerId },
    select: { appUserId: true, status: true },
  })
}

/**
 * `profile` — the profile root page in its three variants (living, memorial,
 * pet) with every viewer-dependent flag. Public under the same rule as the web.
 */
export const profile: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const sessionUserId = await optionalViewerId()

  const isAnon = !sessionUserId
  const rawUser = await getProfileById(id)
  assertPublicMemorialAccess(rawUser, sessionUserId, id)

  const isOwn = sessionUserId ? rawUser.id === sessionUserId : false
  const isMemorialized = rawUser.role === "APP_MEMO"
  const isPet = rawUser.role === "APP_PET"

  const isGuardian = (isMemorialized || isPet) && sessionUserId
    ? rawUser.guardedBy.some((g) => g.guardianId === sessionUserId)
    : false
  const guardians = isMemorialized || isPet
    ? rawUser.guardedBy.map((g) => ({ id: g.guardianId, firstName: g.guardian.firstName }))
    : []

  // Exact birth/death data of a living person is year-only for anyone who is
  // neither the owner nor an accepted guardian.
  const canManageThis = sessionUserId ? canManageProfile(rawUser, sessionUserId) : false
  const user = redactLivingProfile(rawUser, { id: sessionUserId ?? null, canManage: canManageThis })

  const [
    favoritedBy,
    isFavoritedByMe,
    geo,
    galleryImages,
    galleryCount,
    galleryHasVideos,
    placesPins,
    tributeAuthors,
    tributeCount,
    favorites,
    memorials,
    pets,
    bio,
    treeCount,
    documentsPreview,
    documentsCount,
    viewerFeatures,
  ] = await Promise.all([
    getFavoriteCount(id),
    isOwn || !sessionUserId ? Promise.resolve(false) : isFavoritedByUser(sessionUserId, id),
    isMemorialized ? getGeolocationForViewer(id) : Promise.resolve(null),
    getGalleryImageUrls(id, 4),
    getGalleryCount(id),
    getGalleryHasVideos(id),
    getPlacesForMap(id),
    getTributeAuthors(id, 5),
    getTributeCountByProfileId(id),
    !isMemorialized && !isPet ? getFavoritesByUserId(id, sessionUserId) : Promise.resolve([]),
    !isMemorialized && !isPet ? getGuardedProfilesByGuardianId(id) : Promise.resolve([]),
    !isPet ? getPetsByOwnerId(id) : Promise.resolve([]),
    getBioByUserId(id),
    countTreeMembers(id),
    // Private documents never reach a viewer who cannot manage the profile,
    // not even as a preview title or in the count.
    getDocumentsByUserId(id, { includePrivate: canManageThis, take: 3 }),
    getDocumentsCount(id, canManageThis),
    (isPet || (isMemorialized && isGuardian)) && sessionUserId
      ? getMemorialFeatures(sessionUserId)
      : Promise.resolve(null),
  ])

  const hasBio = !!bio && !!(bio.text || bio.quote || bio.images.length > 0)
  const type = isMemorialized ? ("memorialized" as const) : isPet ? ("pet" as const) : ("living" as const)

  // Module order per variant, as the web bento grid renders it. The favourites
  // and guardian modules of a living profile are not navigable for a visitor.
  const sections = isMemorialized
    ? ["tree", "bio", "documents", "gallery", "places", "tributes", "pets"]
    : isPet
      ? ["tree", "bio", "documents", "gallery", "places"]
      : ["tree", "bio", "documents", "gallery", "places", "tributes", "favorites", "guardian", "pets"]

  return {
    profile: {
      id: user.id,
      role: user.role,
      type,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      birthDate: user.birthDate,
      birthPlace: user.birthPlace,
      birthCountry: user.birthCountry,
      birthYear: user.birthYear,
      deathDate: user.deathDate,
      deathPlace: user.deathPlace,
      deathCountry: user.deathCountry,
      deathYear: user.deathYear,
      petSpecies: user.petSpecies,
      petBreed: user.petBreed,
    },
    viewer: {
      isAuthenticated: !!sessionUserId,
      isOwner: isOwn,
      isGuardian,
      canManage: canManageThis,
      isFavoritedByMe,
      // Premium flags, resolved from the VIEWER's own plan.
      canAccessGenCode: isMemorialized && isGuardian && viewerFeatures?.code === "PREMIUM",
      canDownloadPetGenCode: isPet && viewerFeatures?.code === "PREMIUM",
    },
    guardians,
    geo: geo ? { lat: geo.lat, lon: geo.lon } : null,
    counts: {
      favoritedBy,
      tributes: tributeCount,
      media: galleryCount,
      places: placesPins.length,
      documents: documentsCount,
      treeMembers: treeCount,
      favorites: favorites.length,
      guarded: memorials.length,
      pets: pets.length,
    },
    hasBio,
    sections,
    sectionsRequiringSignIn: isAnon ? ["favorites", "guardian"] : [],
    previews: {
      galleryImages,
      galleryHasVideos,
      placesPins,
      tributeAuthors,
      documents: documentsPreview.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category })),
      favorites: favorites.map((fav) => toProfileCard(fav.target)),
      memorials: memorials.map(toProfileCard),
      pets: pets.map(toProfileCard),
    },
    /** Memorial bound to a physical plaque: the client reports the visit to the qr-scan route. */
    trackQrScan: isMemorialized && user.genCode != null,
  }
}

/** `profileEdit` — manager-only edit data, including the restricted PII. */
export const profileEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()

  const row = await getProfileForEdit(id)
  if (!row) notFound()

  const isOwn = id === session.user.id
  const isGuardian =
    (row.role === "APP_MEMO" || row.role === "APP_PET") &&
    row.guardedBy.some((g) => g.guardianId === session.user.id)
  if (!isOwn && !isGuardian) deny()

  const isMemorialized = row.role === "APP_MEMO"
  const isPet = row.role === "APP_PET"
  const petOwners = isPet ? await getPetOwners(id) : []
  const ownerRoot = petOwners.find(({ owner }) =>
    owner.id === session.user.id || owner.guardedBy.some((guardian) => guardian.guardianId === session.user.id),
  )?.ownerId ?? session.user.id
  const ownerOptions = isPet
    ? Array.from(new Map([
        ...Object.values((await getFamilyTree(ownerRoot, { id: session.user.id, canManage: true })).persons)
          .filter((person) => person.role !== "APP_PET")
          .map((person) => [person.id, { id: person.id, name: `${person.firstName} ${person.lastName}`.trim() }] as const),
        ...petOwners.map(({ owner }) => [
          owner.id,
          { id: owner.id, name: `${owner.firstName} ${owner.lastName}`.trim() },
        ] as const),
      ]).values()).sort((a, b) => a.name.localeCompare(b.name))
    : []

  const { guardedBy: _guardedBy, genCode, ...fields } = row
  void _guardedBy

  return {
    type: isMemorialized ? ("memorialized" as const) : isPet ? ("pet" as const) : ("living" as const),
    isOwner: isOwn,
    profile: { ...fields, hasGenCode: genCode != null },
    pet: isPet
      ? { rootId: ownerRoot, ownerIds: petOwners.map((ownership) => ownership.ownerId), ownerOptions }
      : null,
  }
}

/** `favorites` — a profile's favourites list, redacted for the viewer. */
export const favorites: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()

  const [owner, rows] = await Promise.all([
    getProfileById(id),
    getFavoritesByUserId(id, session.user.id),
  ])
  if (!owner) notFound()

  return {
    profile: { id: owner.id, firstName: owner.firstName },
    isOwner: id === session.user.id,
    items: rows.map((fav) => ({ createdAt: fav.createdAt, target: toProfileCard(fav.target) })),
  }
}

/** `memorialized` — profiles a person guards; create quotas only for the owner. */
export const memorialized: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  const isOwn = id === session.user.id

  const [owner, memorials, creationStatus, petCreationStatus, features] = await Promise.all([
    getProfileById(id),
    getGuardedProfilesByGuardianId(id),
    isOwn ? getMemorialCreationStatus(id) : Promise.resolve(null),
    isOwn ? getPetCreationStatus(id) : Promise.resolve(null),
    isOwn ? getMemorialFeatures(id) : Promise.resolve(null),
  ])
  if (!owner) notFound()

  return {
    profile: { id: owner.id, firstName: owner.firstName },
    isOwner: isOwn,
    showCreate: isOwn,
    items: memorials.map(toProfileCard),
    atLimit: isOwn && !!creationStatus && !creationStatus.allowed,
    memorialsMax: creationStatus?.limit ?? 0,
    petAtLimit: isOwn && !!petCreationStatus && !petCreationStatus.allowed,
    petsMax: petCreationStatus?.limit ?? 0,
    tier: features?.code ?? "FREE",
  }
}

/** `memorialNew` — whether the signed-in guardian may create another memorial. */
export const memorialNew: MobileView = async () => {
  const session = await verifySession()
  const [status, features] = await Promise.all([
    getMemorialCreationStatus(session.user.id),
    getMemorialFeatures(session.user.id),
  ])
  return { ...status, tier: features.code }
}

/** `memorialFromTree` — the signed-in guardian's tree members that can become memorials. */
export const memorialFromTree: MobileView = async () => {
  const session = await verifySession()
  const candidates = await getTreeMemorialCandidates(session.user.id)
  return {
    guardianId: session.user.id,
    profiles: candidates.map((candidate) => ({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      avatarUrl: candidate.avatarUrl,
      role: candidate.role,
      birthDate: candidate.birthDate,
      deathDate: candidate.deathDate,
      petSpecies: candidate.petSpecies,
    })),
  }
}

/** `pets` — pets a person owns. Public like the page; never for a pet or ghost. */
export const pets: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile: owner, viewerId, canManage } = await loadPublicProfile(id)
  if (owner.role === "APP_PET" || owner.role === "APP_GHOST") notFound()

  const [rows, creationStatus, features] = await Promise.all([
    getPetsByOwnerId(id),
    canManage && viewerId ? getPetCreationStatus(viewerId) : Promise.resolve(null),
    canManage && viewerId ? getMemorialFeatures(viewerId) : Promise.resolve(null),
  ])

  return {
    profile: { id: owner.id, firstName: owner.firstName },
    canManage,
    showCreate: canManage,
    items: rows.map(toProfileCard),
    atLimit: canManage && !!creationStatus && !creationStatus.allowed,
    petsMax: creationStatus?.limit ?? 0,
    tier: features?.code ?? "FREE",
  }
}

/** `petNew` — create quota and the owners a new pet can be attached to. */
export const petNew: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()

  const owner = await getProfileById(id)
  if (!owner || !canManageProfile(owner, session.user.id) || owner.role === "APP_PET") deny()

  const creationStatus = await getPetCreationStatus(session.user.id)
  if (!creationStatus.allowed) {
    return { ...creationStatus, ownerId: id, ownerOptions: [] }
  }

  // Pets cannot own other pets, so they are left out of the option list.
  const { persons } = await getFamilyTree(id, { id, canManage: true })
  const ownerOptions = Object.values(persons)
    .filter((p) => p.role !== "APP_PET")
    .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }))
    .sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : a.name.localeCompare(b.name)))

  return { ...creationStatus, ownerId: id, ownerOptions }
}

/** `qrCode` — a profile's QR page: unlocked with its URL, or locked with the quota. */
export const qrCode: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()

  const target = await getProfileById(id)
  if (!target) notFound()

  // Pet exports live on the pet profile, with a live Premium check per download.
  if (target.role === "APP_PET") {
    return { state: "petProfile" as const, profileId: target.id, profileUrl: null, limit: null, tier: null, memorialQr: false }
  }

  const isGuardian = target.role === "APP_MEMO" && target.guardedBy.some((g) => g.guardianId === session.user.id)

  // A memorial's QR Code is accessible only to its guardian(s).
  if (target.role === "APP_MEMO" && !isGuardian) notFound()

  const quotaGuardianId = target.role === "APP_MEMO" ? session.user.id : target.id
  const [quota, features] = await Promise.all([
    getQrQuotaStatus(quotaGuardianId, target.id),
    getMemorialFeatures(quotaGuardianId),
  ])
  const memorialQr = target.role === "APP_MEMO"

  if (!quota.unlocked) {
    return { state: "locked" as const, profileId: target.id, profileUrl: null, limit: quota.limit, tier: features.code, memorialQr }
  }

  const appUrl = process.env.APP_URL ?? "https://genealogiq.app"
  return {
    state: "unlocked" as const,
    profileId: target.id,
    profileUrl: `${appUrl}/profile/${id}`,
    limit: quota.limit,
    tier: features.code,
    memorialQr,
  }
}

/**
 * `tree` — the family tree as the viewer may see it (`getFamilyTree` applies
 * the living-relative redaction). A pet has no tree of its own: the view
 * answers with the owner's tree to open and the pet to focus.
 */
export const tree: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const focus = optionalParam(params, "focus")
  const { profile: root, viewerId, canManage } = await loadPublicProfile(id)

  if (root.role === "APP_PET") {
    const [firstOwnership] = await getPetOwners(id)
    if (!firstOwnership) notFound()
    return { state: "petRedirect" as const, rootId: firstOwnership.ownerId, focusId: id }
  }

  const [{ persons, relations, petOwnerships }, features, memberCount, petCreationStatus] = await Promise.all([
    getFamilyTree(id, { id: viewerId ?? null, canManage }),
    getMemorialFeatures(id),
    countTreeMembers(id),
    canManage && viewerId ? getPetCreationStatus(viewerId) : Promise.resolve(null),
  ])
  // A visitor views the tree read-only, so no guardianship lookup is needed.
  const guardianRows = viewerId ? await getGuardianRows(viewerId) : []

  const managedIds = new Set<string>(viewerId ? [viewerId] : [])
  const requestedIds = new Set<string>()
  for (const g of guardianRows) {
    if (g.status === "ACCEPTED") managedIds.add(g.appUserId)
    else if (g.status === "PENDING") requestedIds.add(g.appUserId)
  }

  const rootParents = relations
    .filter((r) => r.type === "PARENT_OF" && r.toId === id)
    .map((r) => {
      const p = persons[r.fromId]
      return p ? { id: p.id, name: `${p.firstName} ${p.lastName}` } : null
    })
    .filter((p): p is { id: string; name: string } => p !== null)

  return {
    state: "tree" as const,
    rootId: id,
    rootFirstName: root.firstName,
    focusId: focus ?? null,
    persons,
    relations,
    petOwnerships,
    canManage,
    readOnly: !canManage,
    sessionUserId: viewerId ?? null,
    managedIds: Array.from(managedIds),
    requestedIds: Array.from(requestedIds),
    memberCount,
    memberLimit: features.treeMaxMembers,
    currentTier: features.code,
    petCount: new Set(petOwnerships.map((ownership) => ownership.petId)).size,
    managedPetCount: petCreationStatus?.count ?? 0,
    petLimit: petCreationStatus?.limit ?? features.petsMax,
    petAtLimit: petCreationStatus ? !petCreationStatus.allowed : true,
    rootParents,
  }
}
