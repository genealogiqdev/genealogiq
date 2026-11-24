import "server-only"

import type { MobileView } from "@genealogiq/auth/mobile"
import * as account from "./views/account"
import * as content from "./views/content"
import * as profile from "./views/profile"
import * as scan from "./views/scan"

/**
 * Mobile read registry: one view per web screen-load. Each view applies the
 * guard of the page it mirrors — see `./views/shared.ts`.
 */
export const views: Record<string, MobileView> = {
  // Account / protected shell
  me: account.me,
  header: account.header,
  home: account.home,
  messages: account.messages,
  subscriptions: account.subscriptions,
  billingQrCode: account.billingQrCode,
  qrLanding: account.qrLanding,

  // Profile
  profile: profile.profile,
  profileEdit: profile.profileEdit,
  favorites: profile.favorites,
  memorialized: profile.memorialized,
  memorialNew: profile.memorialNew,
  memorialFromTree: profile.memorialFromTree,
  pets: profile.pets,
  petNew: profile.petNew,
  qrCode: profile.qrCode,
  tree: profile.tree,

  // Profile content
  bio: content.bio,
  bioEdit: content.bioEdit,
  gallery: content.gallery,
  galleryEdit: content.galleryEdit,
  documents: content.documents,
  documentNew: content.documentNew,
  documentEdit: content.documentEdit,
  places: content.places,
  placesMap: content.placesMap,
  place: content.place,
  placeNew: content.placeNew,
  placeEdit: content.placeEdit,
  geolocation: content.geolocation,
  geolocationEdit: content.geolocationEdit,
  tributes: content.tributes,
  tributeEdit: content.tributeEdit,

  // Genealogy Scan
  genealogyScans: scan.genealogyScans,
  genealogyScan: scan.genealogyScan,
}

/**
 * Views the web also serves to anonymous visitors: the public profile, its
 * public sub-pages and the QR landing. The bridge does not require a token for
 * these; each still resolves an optional session and applies
 * `assertPublicMemorialAccess` (or the landing page's own rules).
 */
export const publicViews: readonly string[] = [
  "profile",
  "bio",
  "gallery",
  "documents",
  "places",
  "placesMap",
  "place",
  "geolocation",
  "tree",
  "pets",
  "tributes",
  "qrLanding",
]
