import "server-only"

import { notFound } from "next/navigation"
import type { MobileView } from "@genealogiq/auth/mobile"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { getGuardianGeoPlacesStatus } from "@/lib/geo-quota"
import { getPlaceQrPath, isMemorialPlace } from "@/lib/place-qr"
import { getMemorialFeatures } from "@/lib/subscription"
import { getBioByUserId, type BioRow } from "@/queries/bio"
import { ANON_DOCUMENTS_LIMIT, getDocumentsByUserId, getDocumentsCount, type DocumentRow } from "@/queries/documents"
import { getGalleryByUserId, getGalleryCounts, type GalleryItemRow } from "@/queries/gallery"
import { getGeolocationByUserId, getGeolocationForViewer } from "@/queries/geolocation"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { ANON_PLACES_LIMIT, getPlaceById, getPlacesByUserId, getPlacesForMap, type GeoPlaceRow } from "@/queries/places"
import { getProfileById } from "@/queries/profile"
import {
  getApprovedTributesByProfileId,
  getMyTributeForProfile,
  getMyUnpublishedTributesForProfile,
  getTributeCountByProfileId,
} from "@/queries/tribute"
import { deny, loadManagedProfile, loadPublicProfile, optionalParam, requireParam } from "./shared"

// Anonymous slices. Gallery and tributes keep page-local constants on the web
// (gallery/page.tsx, tributes/page.tsx); documents and places export theirs.
export const ANON_GALLERY_LIMIT = 12
export const ANON_TRIBUTES_LIMIT = 16

/* ------------------------------------------------------------------ bio --- */

function toBio(bio: BioRow | null) {
  if (!bio) return null
  return {
    quote: bio.quote,
    text: bio.text,
    images: bio.images.map((image) => ({ id: image.id, url: image.url, aspect: image.aspect, order: image.order })),
  }
}

/** `bio` — biography; quota state only for a manager. */
export const bio: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, isAnon, canManage } = await loadPublicProfile(id)
  const row = await getBioByUserId(id)

  const [features, combinedMedia] = canManage
    ? await Promise.all([getMemorialFeatures(id), getCombinedMediaUsage(id)])
    : [null, null]

  const textLen = row?.text?.length ?? 0
  return {
    profile: { id: profile.id, firstName: profile.firstName },
    canManage,
    gated: isAnon,
    isEmpty: !row || (!row.quote && !row.text && row.images.length === 0),
    bio: toBio(row),
    quota: features && combinedMedia
      ? {
          tier: features.code,
          atLimit: textLen >= features.bioMaxChars || combinedMedia.images >= features.mediaMaxImages,
        }
      : null,
  }
}

/** `bioEdit` — manager-only form data with the text and image quotas. */
export const bioEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const [row, features, combinedMedia] = await Promise.all([
    getBioByUserId(id),
    getMemorialFeatures(id),
    getCombinedMediaUsage(id),
  ])
  const textLen = row?.text?.length ?? 0
  const imageCount = row?.images.length ?? 0

  return {
    profileId: id,
    isCreating: !row,
    bio: toBio(row),
    maxChars: features.bioMaxChars,
    maxImages: features.mediaMaxImages,
    otherImagesUsed: combinedMedia.images - imageCount,
    tier: features.code,
    atLimit: textLen >= features.bioMaxChars || combinedMedia.images >= features.mediaMaxImages,
  }
}

/* -------------------------------------------------------------- gallery --- */

function toGalleryItem(item: GalleryItemRow) {
  return {
    id: item.id,
    kind: item.kind,
    url: item.url,
    poster: item.poster,
    durationSec: item.durationSec,
    takenAt: item.takenAt,
    location: item.location,
    description: item.description,
    order: item.order,
  }
}

/** `gallery` — media; a visitor gets the first 12 items with metadata removed. */
export const gallery: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, isAnon, canManage } = await loadPublicProfile(id)

  const [features, combinedMedia] = canManage
    ? await Promise.all([getMemorialFeatures(id), getCombinedMediaUsage(id)])
    : [null, null]

  const items = await getGalleryByUserId(id, isAnon ? ANON_GALLERY_LIMIT : undefined, isAnon)
  const counts = isAnon ? await getGalleryCounts(id) : null
  const imageCount = counts ? counts.images : items.filter((i) => i.kind === "image").length
  const videoCount = counts ? counts.videos : items.filter((i) => i.kind === "video").length

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    canManage,
    gated: isAnon,
    hasMore: imageCount + videoCount > ANON_GALLERY_LIMIT,
    imageCount,
    videoCount,
    items: items.map(toGalleryItem),
    quota: features && combinedMedia
      ? {
          tier: features.code,
          atLimit: combinedMedia.images >= features.mediaMaxImages || combinedMedia.videos >= features.mediaMaxVideos,
        }
      : null,
  }
}

/** `galleryEdit` — manager-only item list with the combined media quota. */
export const galleryEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const [items, features, combinedMedia] = await Promise.all([
    getGalleryByUserId(id),
    getMemorialFeatures(id),
    getCombinedMediaUsage(id),
  ])
  const imageCount = items.filter((i) => i.kind === "image").length
  const videoCount = items.filter((i) => i.kind === "video").length

  return {
    profileId: id,
    items: items.map(toGalleryItem),
    maxImages: features.mediaMaxImages,
    maxVideos: features.mediaMaxVideos,
    otherImagesUsed: combinedMedia.images - imageCount,
    tier: features.code,
    atLimit: combinedMedia.images >= features.mediaMaxImages || videoCount >= features.mediaMaxVideos,
  }
}

/* ------------------------------------------------------------ documents --- */

// The stored file URL is left out of list rows: the file is read through
// /api/documents/[id]/file, which re-checks visibility per request.
function toDocument(doc: DocumentRow) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    fileName: doc.fileName,
    isPublic: doc.isPublic,
    order: doc.order,
    createdAt: doc.createdAt,
  }
}

/** `documents` — list; private rows only for a manager, 12 rows for a visitor. */
export const documents: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, isAnon, canManage } = await loadPublicProfile(id)

  const [rows, features] = await Promise.all([
    getDocumentsByUserId(id, {
      includePrivate: canManage,
      take: isAnon ? ANON_DOCUMENTS_LIMIT : undefined,
    }),
    getMemorialFeatures(id),
  ])
  const count = isAnon ? await getDocumentsCount(id, canManage) : rows.length

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    canManage,
    gated: isAnon,
    hasMore: count > ANON_DOCUMENTS_LIMIT,
    count,
    items: rows.map(toDocument),
    quota: canManage
      ? { tier: features.code, documentsMax: features.documentsMax, atLimit: count >= features.documentsMax }
      : null,
  }
}

/** `documentNew` — manager-only quota check before the create form. */
export const documentNew: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const [features, count] = await Promise.all([getMemorialFeatures(id), getDocumentsCount(id, true)])
  return {
    profileId: id,
    allowed: count < features.documentsMax,
    count,
    limit: features.documentsMax,
    tier: features.code,
  }
}

/** `documentEdit` — manager-only document row, scoped to the profile in the path. */
export const documentEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const documentId = requireParam(params, "documentId")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const existing = await prisma.document.findFirst({ where: { id: documentId, userId: id } })
  if (!existing) notFound()

  return { profileId: id, document: { ...toDocument(existing), fileUrl: existing.fileUrl } }
}

/* --------------------------------------------------------------- places --- */

// What the list and detail screens render. The street-level address fields
// are only part of the manager's edit data.
function toPlace(place: GeoPlaceRow) {
  return {
    id: place.id,
    title: place.title,
    description: place.description,
    categories: place.categories,
    lat: place.lat,
    lon: place.lon,
    neighborhood: place.neighborhood,
    city: place.city,
    state: place.state,
    country: place.country,
    photos: place.photos,
    startDate: place.startDate,
    endDate: place.endDate,
    qrGenerated: place.qrGenerated,
    order: place.order,
  }
}

function toPlaceForEdit(place: GeoPlaceRow) {
  return {
    ...toPlace(place),
    zip: place.zip,
    street: place.street,
    number: place.number,
    complement: place.complement,
  }
}

/** `places` — life places; a visitor gets the first 12. */
export const places: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, viewerId, isAnon, canManage } = await loadPublicProfile(id)

  const [rows, features, geoStatus] = await Promise.all([
    getPlacesByUserId(id, isAnon ? ANON_PLACES_LIMIT : undefined),
    getMemorialFeatures(id),
    // The geo-place pool is shared across everything the guardian manages, so
    // it is only computed for the manager's own gate.
    canManage && viewerId ? getGuardianGeoPlacesStatus(viewerId) : Promise.resolve(null),
  ])

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    canManage,
    gated: isAnon,
    items: rows.map(toPlace),
    quota: geoStatus
      ? { tier: features.code, geoPlacesMax: geoStatus.limit, usage: geoStatus.usage, atLimit: geoStatus.usage >= geoStatus.limit }
      : null,
  }
}

/** `placesMap` — map pins, under the same visitor bound as the list. */
export const placesMap: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, isAnon } = await loadPublicProfile(id)
  const pins = await getPlacesForMap(id, isAnon ? ANON_PLACES_LIMIT : undefined)
  return { profile: { id: profile.id, firstName: profile.firstName }, gated: isAnon, pins }
}

/**
 * `place` — one place. `state` tells the client where the web would have sent
 * the visitor: `profile` (a printed plaque opens the memorial), `places` (a
 * visitor outside the preview slice) or `detail`.
 */
export const place: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const placeId = requireParam(params, "placeId")
  const view = optionalParam(params, "view")
  const { profile, viewerId, isAnon, canManage } = await loadPublicProfile(id)

  const row = await getPlaceById(id, placeId)
  if (!row) {
    // A printed plaque can outlive its place row; the memorial stays its destination.
    if (view !== "details" && profile.role === "APP_MEMO") {
      return { state: "profile" as const, profileId: profile.id }
    }
    if (isAnon) return { state: "places" as const, profileId: id }
    notFound()
  }

  if (view !== "details" && row.qrGenerated && isMemorialPlace(row)) {
    return { state: "profile" as const, profileId: row.userId }
  }

  // Rendering any place detail still enforces the visitor's preview slice.
  if (isAnon && !(await getPlaceById(id, placeId, ANON_PLACES_LIMIT))) {
    return { state: "places" as const, profileId: id }
  }

  const canDownloadQr = viewerId && row.qrGenerated
    ? (await getMemorialFeatures(viewerId)).code === "PREMIUM"
    : false

  return {
    state: "detail" as const,
    profileId: id,
    canManage,
    gated: isAnon,
    place: toPlace(row),
    qrPath: getPlaceQrPath(row),
    canDownloadQr,
  }
}

/** `placeNew` — manager-only geo-place quota check plus the photo quota. */
export const placeNew: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const [features, geoStatus, combinedMedia] = await Promise.all([
    getMemorialFeatures(id),
    getGuardianGeoPlacesStatus(session.user.id),
    getCombinedMediaUsage(id),
  ])

  return {
    profileId: id,
    allowed: geoStatus.usage < geoStatus.limit,
    usage: geoStatus.usage,
    limit: geoStatus.limit,
    mediaMax: features.mediaMaxImages,
    otherImagesUsed: combinedMedia.images,
    tier: features.code,
  }
}

/** `placeEdit` — manager-only place row (full address) with the photo quota. */
export const placeEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const placeId = requireParam(params, "placeId")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const [existing, features, combinedMedia] = await Promise.all([
    prisma.geoPlace.findFirst({ where: { id: placeId, userId: id } }),
    getMemorialFeatures(id),
    getCombinedMediaUsage(id),
  ])
  if (!existing) notFound()

  return {
    profileId: id,
    place: toPlaceForEdit(existing),
    mediaMax: features.mediaMaxImages,
    otherImagesUsed: combinedMedia.images - existing.photos.length,
    tier: features.code,
  }
}

/* ---------------------------------------------------------- geolocation --- */

/** `geolocation` — resting place as the public page renders it. */
export const geolocation: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, canManage } = await loadPublicProfile(id)
  const geo = await getGeolocationForViewer(id)

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    canManage,
    geolocation: geo
      ? {
          placeName: geo.placeName,
          address: geo.address,
          city: geo.city,
          state: geo.state,
          country: geo.country,
          section: geo.section,
          lat: geo.lat,
          lon: geo.lon,
          notes: geo.notes,
          photos: [geo.photo1, geo.photo2, geo.photo3].filter((p): p is string => !!p),
        }
      : null,
  }
}

/** `geolocationEdit` — manager-only stored row. */
export const geolocationEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const session = await verifySession()
  await loadManagedProfile(id, session.user.id)

  const existing = await getGeolocationByUserId(id)
  if (!existing) return { profileId: id, isCreating: true, geolocation: null }

  const { userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = existing
  void _userId
  void _createdAt
  void _updatedAt
  return { profileId: id, isCreating: false, geolocation: fields }
}

/* ------------------------------------------------------------- tributes --- */

/** `tributes` — approved tributes (16 for a visitor) plus the viewer's own unpublished ones. */
export const tributes: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const { profile, viewerId, isAnon, canManage } = await loadPublicProfile(id)

  const rows = await getApprovedTributesByProfileId(id, isAnon ? ANON_TRIBUTES_LIMIT : undefined)
  const tributeCount = isAnon ? await getTributeCountByProfileId(id) : rows.length
  const unpublished = viewerId ? await getMyUnpublishedTributesForProfile(viewerId, id) : []

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    sessionUserId: viewerId ?? null,
    gated: isAnon,
    hasMore: tributeCount > rows.length,
    tributeCount,
    // Writing needs an account, and nobody writes a tribute to themselves.
    canWrite: !isAnon && viewerId !== id,
    isManager: canManage,
    items: rows.map((row) => ({
      id: row.id,
      text: row.text,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt,
      author: row.author,
    })),
    unpublishedTributes: unpublished,
  }
}

/** `tributeEdit` — write form data; an existing tribute only if the viewer wrote it. */
export const tributeEdit: MobileView = async (params) => {
  const id = requireParam(params, "id")
  const tributeId = optionalParam(params, "tributeId")
  const session = await verifySession()

  if (id === session.user.id) deny()

  const [profile, existing] = await Promise.all([
    getProfileById(id),
    tributeId ? getMyTributeForProfile(session.user.id, id, tributeId) : Promise.resolve(null),
  ])
  if (!profile || (tributeId && !existing)) notFound()

  return {
    profile: { id: profile.id, firstName: profile.firstName },
    authorName: session.user.name ?? null,
    isEditing: !!existing,
    existing: existing ? { id: existing.id, text: existing.text, imageUrl: existing.imageUrl } : null,
  }
}
