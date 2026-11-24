// Typed contract for the consumer APP mobile API (apps/app/src/mobile).
// Hand-written DTOs: this file never imports server code. Dates arrive as ISO
// strings. Views answer 401 (no/expired token), 403 (signed in, not allowed),
// 404 (missing); see ./client for how those surface.

import { view, action } from './client'

/* ------------------------------------------------------------------------ */
/* Shared shapes                                                             */
/* ------------------------------------------------------------------------ */

export type IsoDate = string
export type AppRole = 'APP_USER' | 'APP_MEMO' | 'APP_GHOST' | 'APP_PET'
export type ProfileType = 'living' | 'memorialized' | 'pet'
/** Subscription.code is admin-defined; FREE and PREMIUM are the ones sold today. */
export type PlanTier = string
export type Currency = 'USD' | 'BRL' | 'MXN'
export type Cadence = 'annual' | 'monthly'
export type ExtraUnitResource = 'GEO_PLACE' | 'QR_CODE' | 'MEMORIAL'
export type QrFormat = 'png' | 'svg'

export interface ProfileRef {
  id: string
  firstName: string
}

/** A profile as a list card. Exact dates/places are null when redacted; the years stay. */
export interface ProfileCard {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: AppRole
  birthDate: IsoDate | null
  birthPlace: string | null
  birthCountry: string | null
  deathDate: IsoDate | null
  deathPlace: string | null
  deathCountry: string | null
  birthYear: number | null
  deathYear: number | null
  petSpecies: string | null
  petBreed: string | null
}

export interface PlanQuotas {
  code: PlanTier
  treeMaxMembers: number
  bioMaxChars: number
  mediaMaxImages: number
  mediaMaxVideos: number
  documentsMax: number
  geoPlacesMax: number
  memorialsMax: number
  petsMax: number
  qrCodeMax: number
}

export interface CreationStatus {
  count: number
  limit: number
  allowed: boolean
}

export interface ActivePlanSummary {
  id: string
  cadence: string | null
  currency: Currency
  status: string
  currentPeriodEnd: IsoDate
  cancelAtPeriodEnd: boolean
  /** gift: BMS complimentary access; manual: coupon/manual activation. */
  state: 'gift' | 'manual' | 'canceling' | 'active'
  /** Offer the "manage subscription" button (createPortalSession). */
  canManageBilling: boolean
  subscription: {
    id: string
    code: PlanTier
    name: string
    termLength: number | null
    price: number
    monthlyPrice: number | null
  }
}

export interface SubscriptionOption {
  id: string
  code: PlanTier
  name: string
  description: string | null
  termLength: number | null
  price: number
  monthlyPrice: number | null
  currency: Currency
  quotas: PlanQuotas
}

/* ------------------------------------------------------------------------ */
/* Account views                                                             */
/* ------------------------------------------------------------------------ */

export interface MeView {
  user: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    avatarUrl: string | null
    preferredLocale: string | null
    isPublicProfile: boolean
    /** false for Google-only accounts: change password/email and delete account need one. */
    hasPassword: boolean
  }
  unreadCount: number
  plan: { code: PlanTier; quotas: PlanQuotas; active: ActivePlanSummary | null }
  quotas: {
    memorials: CreationStatus
    pets: CreationStatus
    geoPlaces: { usage: number; limit: number; allowed: boolean }
    qrCode: { unlocked: boolean; rank: number; limit: number }
    tree: { count: number; limit: number }
    media: { images: number; videos: number; maxImages: number; maxVideos: number }
    documents: { count: number; limit: number }
    bio: { chars: number; limit: number }
  }
  extraUnits: {
    purchased: Record<ExtraUnitResource, number>
    purchasable: Record<ExtraUnitResource, boolean>
  }
}

export interface HeaderView {
  userId: string
  userName: string | null
  userImage: string | null
  unreadCount: number
}

export interface FavoriteItem {
  createdAt: IsoDate
  target: ProfileCard
}

export interface HomeView {
  userId: string
  firstName: string | null
  favorites: FavoriteItem[]
  memorials: ProfileCard[]
}

export type NotificationType =
  | 'TRIBUTE_PENDING'
  | 'FAMILY_REQUEST_PENDING'
  | 'GUARDIAN_REQUEST_PENDING'
  | 'TRIBUTE_APPROVED'
  | 'TRIBUTE_REJECTED'
  | 'FAMILY_REQUEST_ACCEPTED'
  | 'FAMILY_REQUEST_REJECTED'
  | 'GUARDIAN_REQUEST_ACCEPTED'
  | 'GUARDIAN_REQUEST_REJECTED'

export interface InboxItem {
  id: string
  type: NotificationType
  createdAt: IsoDate
  actor: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null
  /** true when the viewer took the action; false when they received it. */
  viewerActed: boolean
  tributeId: string | null
  familyRelationId: string | null
  appUserGuardianId: string | null
  tribute?: { text: string; imageUrl: string | null; profileId: string; profileName: string } | null
  familyRelation?: { type: string; subtype: string | null; requesterIsParent: boolean } | null
  guardianProfile?: { id: string; firstName: string; lastName: string; avatarUrl: string | null; role: AppRole } | null
}

export interface ActivityCursor {
  id: string
  createdAt: IsoDate
}

export interface ActivityPage {
  items: InboxItem[]
  nextCursor: ActivityCursor | null
}

export interface MessagesView {
  pending: InboxItem[]
  activity: InboxItem[]
  nextCursor: ActivityCursor | null
}

export interface SubscriptionsView {
  subscriptions: SubscriptionOption[]
  activePlan: ActivePlanSummary | null
  flashStatus: 'success' | 'cancel' | null
}

export interface BillingQrCodeView {
  entryPlan: SubscriptionOption | null
  activePlan: ActivePlanSummary | null
}

export interface QrLandingView {
  /**
   * activated: open `profileId`. available: signed in → activation form
   * (activateGenCode), visitor → sign-up/sign-in. soldToAnotherBuyer / expired: explain.
   */
  state: 'activated' | 'available' | 'soldToAnotherBuyer' | 'expired'
  genCode: string
  authenticated: boolean
  profileId: string | null
}

/* ------------------------------------------------------------------------ */
/* Profile views                                                             */
/* ------------------------------------------------------------------------ */

export type ProfileSection =
  | 'tree' | 'bio' | 'documents' | 'gallery' | 'places' | 'tributes' | 'favorites' | 'guardian' | 'pets'

export interface MapPin {
  id: string
  title: string
  lat: number
  lon: number
  categories: string[]
  photo: string | null
}

export interface ProfileView {
  profile: {
    id: string
    role: AppRole
    type: ProfileType
    firstName: string
    lastName: string
    avatarUrl: string | null
    birthDate: IsoDate | null
    birthPlace: string | null
    birthCountry: string | null
    birthYear: number | null
    deathDate: IsoDate | null
    deathPlace: string | null
    deathCountry: string | null
    deathYear: number | null
    petSpecies: string | null
    petBreed: string | null
  }
  viewer: {
    isAuthenticated: boolean
    isOwner: boolean
    /** Accepted guardian of this memorial/pet. */
    isGuardian: boolean
    /** Owner or accepted guardian: show edit affordances. */
    canManage: boolean
    isFavoritedByMe: boolean
    /** Memorial guardian on PREMIUM: QR/GenCode page is available. */
    canAccessGenCode: boolean
    /** Pet viewed by a PREMIUM account: downloadPetQrCode is available. */
    canDownloadPetGenCode: boolean
  }
  guardians: { id: string; firstName: string }[]
  geo: { lat: number; lon: number } | null
  counts: {
    favoritedBy: number
    tributes: number
    media: number
    places: number
    documents: number
    treeMembers: number
    favorites: number
    guarded: number
    pets: number
  }
  hasBio: boolean
  /** Modules to render, in order, for this profile type. */
  sections: ProfileSection[]
  /** Modules shown but not navigable for a visitor. */
  sectionsRequiringSignIn: ProfileSection[]
  previews: {
    galleryImages: string[]
    galleryHasVideos: boolean
    placesPins: MapPin[]
    tributeAuthors: { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]
    documents: { id: string; title: string; category: string }[]
    favorites: ProfileCard[]
    memorials: ProfileCard[]
    pets: ProfileCard[]
  }
  /** When true, POST appHttp.qrScan() with { profileId } once per visit. */
  trackQrScan: boolean
}

export interface ProfileEditView {
  type: ProfileType
  isOwner: boolean
  profile: {
    id: string
    role: AppRole
    isPublicProfile: boolean
    firstName: string
    lastName: string
    maidenName: string | null
    nickname: string | null
    gender: string | null
    avatarUrl: string | null
    birthDate: IsoDate | null
    birthPlace: string | null
    birthState: string | null
    birthCountry: string | null
    deathDate: IsoDate | null
    deathPlace: string | null
    deathState: string | null
    deathCountry: string | null
    deathCause: string | null
    petSpecies: string | null
    petBreed: string | null
    website: string | null
    instagram: string | null
    linkedin: string | null
    fb: string | null
    x: string | null
    tiktok: string | null
    youtube: string | null
    otherSocial: string | null
    nationalId: string | null
    email: string | null
    phone: string | null
    phoneCountryCode: string
    notes: string | null
    address: {
      id: string
      zip: string | null
      street: string | null
      number: string | null
      complement: string | null
      neighborhood: string | null
      city: string | null
      state: string | null
      country: string | null
    } | null
    hasGenCode: boolean
  }
  /** Only for a pet: tree root to pass to updatePet and the selectable owners. */
  pet: { rootId: string; ownerIds: string[]; ownerOptions: { id: string; name: string }[] } | null
}

export interface FavoritesView {
  profile: ProfileRef
  isOwner: boolean
  items: FavoriteItem[]
}

export interface MemorializedView {
  profile: ProfileRef
  isOwner: boolean
  showCreate: boolean
  items: ProfileCard[]
  atLimit: boolean
  memorialsMax: number
  petAtLimit: boolean
  petsMax: number
  tier: PlanTier
}

export interface MemorialNewView extends CreationStatus {
  tier: PlanTier
}

export interface MemorialFromTreeView {
  guardianId: string
  profiles: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    role: AppRole
    birthDate: IsoDate | null
    deathDate: IsoDate | null
    petSpecies: string | null
  }[]
}

export interface PetsView {
  profile: ProfileRef
  canManage: boolean
  showCreate: boolean
  items: ProfileCard[]
  atLimit: boolean
  petsMax: number
  tier: PlanTier
}

export interface PetNewView extends CreationStatus {
  ownerId: string
  /** Empty when `allowed` is false. */
  ownerOptions: { id: string; name: string }[]
}

export interface QrCodeView {
  /** petProfile: pets export from their profile screen, open `profileId` instead. */
  state: 'unlocked' | 'locked' | 'petProfile'
  profileId: string
  /** The URL to encode; only when unlocked. */
  profileUrl: string | null
  limit: number | null
  tier: PlanTier | null
  memorialQr: boolean
}

export interface TreePerson {
  id: string
  firstName: string
  lastName: string
  maidenName: string | null
  nickname: string | null
  gender: string | null
  avatarUrl: string | null
  birthDate: IsoDate | null
  birthPlace: string | null
  birthCountry: string | null
  deathDate: IsoDate | null
  deathPlace: string | null
  deathCountry: string | null
  birthYear: number | null
  deathYear: number | null
  petSpecies: string | null
  petBreed: string | null
  role: AppRole
  pending: boolean
}

export interface TreeRelation {
  id: string
  type: 'PARENT_OF' | 'SPOUSE' | 'SIBLING'
  subtype: string | null
  fromId: string
  toId: string
  startDate: IsoDate | null
  endDate: IsoDate | null
  status: 'PENDING' | 'ACCEPTED'
  requestedById: string | null
}

export type TreeView =
  | {
      /** A pet has no tree: load the tree of `rootId` and focus `focusId`. */
      state: 'petRedirect'
      rootId: string
      focusId: string
    }
  | {
      state: 'tree'
      rootId: string
      rootFirstName: string
      focusId: string | null
      persons: Record<string, TreePerson>
      relations: TreeRelation[]
      petOwnerships: { id: string; petId: string; ownerId: string; createdAt: IsoDate }[]
      canManage: boolean
      readOnly: boolean
      sessionUserId: string | null
      /** Persons the viewer may edit (self + accepted guardianships). */
      managedIds: string[]
      /** Persons with a pending co-management request from the viewer. */
      requestedIds: string[]
      memberCount: number
      memberLimit: number
      currentTier: PlanTier
      petCount: number
      managedPetCount: number
      petLimit: number
      petAtLimit: boolean
      rootParents: { id: string; name: string }[]
    }

/* ------------------------------------------------------------------------ */
/* Profile content views                                                     */
/* ------------------------------------------------------------------------ */

export interface BioContent {
  quote: string | null
  text: string | null
  images: { id: string; url: string; aspect: string; order: number }[]
}

export interface BioView {
  profile: ProfileRef
  canManage: boolean
  /** Visitor: show the sign-up prompt. */
  gated: boolean
  isEmpty: boolean
  bio: BioContent | null
  /** Manager only. */
  quota: { tier: PlanTier; atLimit: boolean } | null
}

export interface BioEditView {
  profileId: string
  isCreating: boolean
  bio: BioContent | null
  maxChars: number
  maxImages: number
  otherImagesUsed: number
  tier: PlanTier
  atLimit: boolean
}

export interface GalleryItem {
  id: string
  kind: 'image' | 'video'
  url: string
  poster: string | null
  durationSec: number | null
  /** takenAt/location/description are null for a visitor. */
  takenAt: string | null
  location: string | null
  description: string | null
  order: number
}

export interface GalleryView {
  profile: ProfileRef
  canManage: boolean
  /** Visitor: `items` is the first 12 only; opening one asks to sign up. */
  gated: boolean
  hasMore: boolean
  imageCount: number
  videoCount: number
  items: GalleryItem[]
  quota: { tier: PlanTier; atLimit: boolean } | null
}

export interface GalleryEditView {
  profileId: string
  items: GalleryItem[]
  maxImages: number
  maxVideos: number
  otherImagesUsed: number
  tier: PlanTier
  atLimit: boolean
}

export interface DocumentItem {
  id: string
  title: string
  description: string | null
  category: string
  fileName: string | null
  isPublic: boolean
  order: number
  createdAt: IsoDate
}

export interface DocumentsView {
  profile: ProfileRef
  canManage: boolean
  /** Visitor: first 12 public documents only. Read a file with appHttp.documentFile(id) (signed in). */
  gated: boolean
  hasMore: boolean
  count: number
  items: DocumentItem[]
  quota: { tier: PlanTier; documentsMax: number; atLimit: boolean } | null
}

export interface DocumentNewView {
  profileId: string
  allowed: boolean
  count: number
  limit: number
  tier: PlanTier
}

export interface DocumentEditView {
  profileId: string
  document: DocumentItem & { fileUrl: string }
}

export interface PlaceItem {
  id: string
  title: string
  description: string | null
  categories: string[]
  lat: number
  lon: number
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
  photos: string[]
  startDate: IsoDate | null
  endDate: IsoDate | null
  qrGenerated: boolean
  order: number
}

export interface PlaceEditItem extends PlaceItem {
  zip: string | null
  street: string | null
  number: string | null
  complement: string | null
}

export interface PlacesView {
  profile: ProfileRef
  canManage: boolean
  /** Visitor: first 12 places only. */
  gated: boolean
  items: PlaceItem[]
  quota: { tier: PlanTier; geoPlacesMax: number; usage: number; atLimit: boolean } | null
}

export interface PlacesMapView {
  profile: ProfileRef
  gated: boolean
  pins: MapPin[]
}

export type PlaceView =
  /** A printed plaque (or a removed place of a memorial): open the profile. */
  | { state: 'profile'; profileId: string }
  /** Visitor outside the preview slice: back to the places list. */
  | { state: 'places'; profileId: string }
  | {
      state: 'detail'
      profileId: string
      canManage: boolean
      gated: boolean
      place: PlaceItem
      /** Relative path the place QR encodes (prefix with the app origin). */
      qrPath: string
      /** Signed-in PREMIUM viewer of a generated QR: downloadPlaceQrCode is available. */
      canDownloadQr: boolean
    }

export interface PlaceNewView {
  profileId: string
  allowed: boolean
  usage: number
  limit: number
  mediaMax: number
  otherImagesUsed: number
  tier: PlanTier
}

export interface PlaceEditView {
  profileId: string
  place: PlaceEditItem
  mediaMax: number
  otherImagesUsed: number
  tier: PlanTier
}

export interface GeolocationView {
  profile: ProfileRef
  canManage: boolean
  geolocation: {
    placeName: string
    address: string | null
    city: string | null
    state: string | null
    country: string | null
    section: string | null
    lat: number
    lon: number
    notes: string | null
    photos: string[]
  } | null
}

export interface GeolocationEditView {
  profileId: string
  isCreating: boolean
  geolocation: {
    id: string
    placeName: string
    address: string | null
    city: string | null
    state: string | null
    country: string | null
    section: string | null
    lat: number
    lon: number
    notes: string | null
    photo1: string | null
    photo2: string | null
    photo3: string | null
    date: IsoDate | null
    zip: string | null
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
  } | null
}

export interface TributeItem {
  id: string
  text: string
  imageUrl: string | null
  createdAt: IsoDate
  author: { id: string; firstName: string; lastName: string; avatarUrl: string | null }
}

export interface TributesView {
  profile: ProfileRef
  sessionUserId: string | null
  /** Visitor: first 16 approved tributes only. */
  gated: boolean
  hasMore: boolean
  tributeCount: number
  canWrite: boolean
  /** Owner/guardian: may approve, reject and delete. */
  isManager: boolean
  items: TributeItem[]
  /** The viewer's own tributes still PENDING or REJECTED. */
  unpublishedTributes: { id: string; text: string; status: 'PENDING' | 'REJECTED' }[]
}

export interface TributeEditView {
  profile: ProfileRef
  authorName: string | null
  isEditing: boolean
  existing: { id: string; text: string; imageUrl: string | null } | null
}

/* ------------------------------------------------------------------------ */
/* Action inputs / results                                                   */
/* ------------------------------------------------------------------------ */

/** Payloads validated server-side by the action's own schema. */
export type FormPayload = Record<string, unknown>

export interface VerifyEmailResult {
  status: 'verified' | 'emailChanged'
  /** Present after a sign-up verification: store it as the session token. */
  token?: string
  expiresAt?: IsoDate
}

export interface FeedbackInput {
  type: 'bug' | 'contact' | 'career'
  message: string
  cvUrl?: string
  page?: string
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/* ------------------------------------------------------------------------ */
/* API                                                                       */
/* ------------------------------------------------------------------------ */

export const appApi = {
  /* ---- views: account ---- */
  me: () => view<MeView>('app', 'me'),
  header: () => view<HeaderView>('app', 'header'),
  home: () => view<HomeView>('app', 'home'),
  /** No side effect: call markMessagesRead when the inbox is shown. */
  messages: () => view<MessagesView>('app', 'messages'),
  /** Pass status/sessionId when returning from Stripe Checkout. */
  subscriptions: (params?: { status?: 'success' | 'cancel'; sessionId?: string }) =>
    view<SubscriptionsView>('app', 'subscriptions', params),
  billingQrCode: () => view<BillingQrCodeView>('app', 'billingQrCode'),
  /** Public. */
  qrLanding: (genCode: string) => view<QrLandingView>('app', 'qrLanding', { genCode }),

  /* ---- views: profile (public unless noted) ---- */
  profile: (id: string) => view<ProfileView>('app', 'profile', { id }),
  /** Signed in, owner/guardian only (403 otherwise). */
  profileEdit: (id: string) => view<ProfileEditView>('app', 'profileEdit', { id }),
  /** Signed in. */
  favorites: (id: string) => view<FavoritesView>('app', 'favorites', { id }),
  /** Signed in. */
  memorialized: (id: string) => view<MemorializedView>('app', 'memorialized', { id }),
  memorialNew: () => view<MemorialNewView>('app', 'memorialNew'),
  memorialFromTree: () => view<MemorialFromTreeView>('app', 'memorialFromTree'),
  pets: (id: string) => view<PetsView>('app', 'pets', { id }),
  /** Signed in, manager of `ownerId` only. */
  petNew: (ownerId: string) => view<PetNewView>('app', 'petNew', { id: ownerId }),
  /** Signed in. */
  qrCode: (id: string) => view<QrCodeView>('app', 'qrCode', { id }),
  tree: (id: string, focus?: string) => view<TreeView>('app', 'tree', { id, focus }),

  /* ---- views: profile content (public unless noted; edit/new are manager-only) ---- */
  bio: (id: string) => view<BioView>('app', 'bio', { id }),
  bioEdit: (id: string) => view<BioEditView>('app', 'bioEdit', { id }),
  gallery: (id: string) => view<GalleryView>('app', 'gallery', { id }),
  galleryEdit: (id: string) => view<GalleryEditView>('app', 'galleryEdit', { id }),
  documents: (id: string) => view<DocumentsView>('app', 'documents', { id }),
  documentNew: (id: string) => view<DocumentNewView>('app', 'documentNew', { id }),
  documentEdit: (id: string, documentId: string) =>
    view<DocumentEditView>('app', 'documentEdit', { id, documentId }),
  places: (id: string) => view<PlacesView>('app', 'places', { id }),
  placesMap: (id: string) => view<PlacesMapView>('app', 'placesMap', { id }),
  /** In-app navigation passes details=true; a scanned plaque link does not. */
  place: (id: string, placeId: string, details = true) =>
    view<PlaceView>('app', 'place', { id, placeId, view: details ? 'details' : undefined }),
  placeNew: (id: string) => view<PlaceNewView>('app', 'placeNew', { id }),
  placeEdit: (id: string, placeId: string) => view<PlaceEditView>('app', 'placeEdit', { id, placeId }),
  geolocation: (id: string) => view<GeolocationView>('app', 'geolocation', { id }),
  geolocationEdit: (id: string) => view<GeolocationEditView>('app', 'geolocationEdit', { id }),
  tributes: (id: string) => view<TributesView>('app', 'tributes', { id }),
  /** Signed in; not for your own profile (403). */
  tributeEdit: (id: string, tributeId?: string) =>
    view<TributeEditView>('app', 'tributeEdit', { id, tributeId }),

  /* ---- actions: account (public: signUp, forgotPassword, resetPassword, verifyEmail) ---- */
  /** Success answers { ok: true, redirect: '/verify-email' }; the same for an email already in use. */
  signUp: (input: { firstName: string; lastName: string; email: string; password: string; callbackUrl?: string }) =>
    action('app', 'signUp', { form: input }),
  forgotPassword: (email: string) => action('app', 'forgotPassword', { form: { email } }),
  resetPassword: (input: { token: string; password: string }) => action('app', 'resetPassword', { form: input }),
  verifyEmail: (token: string) => action<VerifyEmailResult>('app', 'verifyEmail', { form: { token } }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    action('app', 'changePassword', { form: input }),
  requestEmailChange: (input: { newEmail: string; currentPassword: string }) =>
    action('app', 'requestEmailChange', { form: input }),
  /** On success discard the stored token. */
  deleteAccount: (currentPassword: string) => action('app', 'deleteAccount', { form: { currentPassword } }),
  updatePreferredLocale: (locale: string) => action('app', 'updatePreferredLocale', { args: [locale] }),
  /** The signed-in user's own living profile. */
  updateProfile: (data: FormPayload) => action('app', 'updateProfile', { args: [data] }),

  /* ---- actions: billing (open the returned Stripe URL in a browser) ---- */
  createCheckoutSession: (subscriptionId: string, cadence: Cadence) =>
    action<{ url: string }>('app', 'createCheckoutSession', { args: [subscriptionId, cadence] }),
  changeSubscription: (subscriptionId: string, cadence: Cadence) =>
    action<{ effect: 'upgraded' | 'scheduled' }>('app', 'changeSubscription', { args: [subscriptionId, cadence] }),
  createPortalSession: () => action<{ url: string }>('app', 'createPortalSession'),
  /** returnPath: internal web path Stripe returns to (default /home). */
  createExtraUnitCheckoutSession: (resource: ExtraUnitResource, returnPath?: string) =>
    action<{ url: string }>('app', 'createExtraUnitCheckoutSession', {
      args: returnPath === undefined ? [resource] : [resource, returnPath],
    }),

  /* ---- actions: messages, push, feedback ---- */
  /** Answers the page itself ({ items, nextCursor }), not an ActionResult. */
  loadMoreActivity: (cursor: ActivityCursor) =>
    action('app', 'loadMoreActivity', { args: [cursor] }) as unknown as Promise<ActivityPage>,
  markMessagesRead: () => action<{ marked: number }>('app', 'markMessagesRead'),
  subscribePush: (subscription: PushSubscriptionInput) => action('app', 'subscribePush', { args: [subscription] }),
  unsubscribePush: (endpoint: string) => action('app', 'unsubscribePush', { args: [{ endpoint }] }),
  /** Signed-in variant (no captcha); the reply address is the account email. */
  sendFeedback: (input: FeedbackInput) => action('app', 'sendFeedback', { args: [input] }),

  /* ---- actions: favourites, guardians, tributes ---- */
  toggleFavorite: (profileId: string) => action<{ favorited: boolean }>('app', 'toggleFavorite', { args: [profileId] }),
  requestGuardianship: (profileId: string) => action('app', 'requestGuardianship', { args: [{ profileId }] }),
  approveGuardianship: (guardianshipId: string) =>
    action('app', 'approveGuardianship', { args: [{ guardianshipId }] }),
  rejectGuardianship: (guardianshipId: string) => action('app', 'rejectGuardianship', { args: [{ guardianshipId }] }),
  /** Pass tributeId to edit one of your own tributes. */
  submitTribute: (profileId: string, data: { text: string; imageUrl?: string | null }, tributeId?: string) =>
    action('app', 'submitTribute', { args: tributeId ? [profileId, data, tributeId] : [profileId, data] }),
  approveTribute: (tributeId: string, profileId: string) =>
    action('app', 'approveTribute', { args: [tributeId, profileId] }),
  rejectTribute: (tributeId: string, profileId: string) =>
    action('app', 'rejectTribute', { args: [tributeId, profileId] }),
  deleteTribute: (tributeId: string) => action('app', 'deleteTribute', { args: [tributeId] }),

  /* ---- actions: memorials, GenCode, pets ---- */
  createMemorial: (data: FormPayload) => action<{ id: string }>('app', 'createMemorial', { args: [data] }),
  updateMemorial: (profileId: string, data: FormPayload) =>
    action('app', 'updateMemorial', { args: [profileId, data] }),
  deleteMemorial: (profileId: string) => action('app', 'deleteMemorial', { args: [profileId] }),
  /** A quota refusal also carries `quota: { limit, tier }` beside ok/message. */
  addMemorialFromTree: (profileId: string) =>
    action<{ id: string; alreadyAdded: boolean }>('app', 'addMemorialFromTree', { args: [{ profileId }] }),
  activateGenCode: (genCode: string, data: FormPayload) =>
    action<{ id: string }>('app', 'activateGenCode', { args: [genCode, data] }),
  createPet: (data: FormPayload, rootId?: string) =>
    action<{ id: string }>('app', 'createPet', { args: rootId ? [data, rootId] : [data] }),
  updatePet: (profileId: string, data: FormPayload, rootId?: string) =>
    action('app', 'updatePet', { args: rootId ? [profileId, data, rootId] : [profileId, data] }),
  attachPet: (rootId: string, petId: string, ownerId: string) =>
    action('app', 'attachPet', { args: [rootId, petId, ownerId] }),
  detachPet: (rootId: string, petId: string, ownerId: string) =>
    action('app', 'detachPet', { args: [rootId, petId, ownerId] }),
  detachPetFromTree: (rootId: string, petId: string) => action('app', 'detachPetFromTree', { args: [rootId, petId] }),
  deletePet: (profileId: string) => action('app', 'deletePet', { args: [profileId] }),
  downloadPetQrCode: (profileId: string, format: QrFormat = 'png') =>
    action<{ dataUrl: string }>('app', 'downloadPetQrCode', { args: [profileId, format] }),

  /* ---- actions: family tree ---- */
  addRelation: (rootId: string, data: FormPayload) => action('app', 'addRelation', { args: [rootId, data] }),
  addGhostRelative: (rootId: string, data: FormPayload) =>
    action('app', 'addGhostRelative', { args: [rootId, data] }),
  updateMember: (rootId: string, memberId: string, data: FormPayload) =>
    action('app', 'updateMember', { args: [rootId, memberId, data] }),
  updateRelation: (rootId: string, relationId: string, data: FormPayload) =>
    action('app', 'updateRelation', { args: [rootId, relationId, data] }),
  removeRelation: (rootId: string, relationId: string) =>
    action('app', 'removeRelation', { args: [rootId, relationId] }),
  removeMember: (rootId: string, memberId: string) => action('app', 'removeMember', { args: [rootId, memberId] }),
  acceptFamilyRequest: (relationId: string) => action('app', 'acceptFamilyRequest', { args: [relationId] }),
  rejectFamilyRequest: (relationId: string) => action('app', 'rejectFamilyRequest', { args: [relationId] }),

  /* ---- actions: profile content ---- */
  saveBio: (profileId: string, data: FormPayload) => action('app', 'saveBio', { args: [profileId, data] }),
  deleteBio: (profileId: string) => action('app', 'deleteBio', { args: [profileId] }),
  saveGallery: (profileId: string, data: FormPayload) => action('app', 'saveGallery', { args: [profileId, data] }),
  deleteGallery: (profileId: string) => action('app', 'deleteGallery', { args: [profileId] }),
  /** documentId null creates. */
  saveDocument: (profileId: string, documentId: string | null, data: FormPayload) =>
    action('app', 'saveDocument', { args: [profileId, documentId, data] }),
  deleteDocument: (profileId: string, documentId: string) =>
    action('app', 'deleteDocument', { args: [profileId, documentId] }),
  /** placeId null creates. */
  savePlace: (profileId: string, placeId: string | null, data: FormPayload) =>
    action('app', 'savePlace', { args: [profileId, placeId, data] }),
  deletePlace: (profileId: string, placeId: string) => action('app', 'deletePlace', { args: [profileId, placeId] }),
  /** Signed in (the web allows any viewer). */
  markPlaceQrGenerated: (profileId: string, placeId: string) =>
    action('app', 'markPlaceQrGenerated', { args: [profileId, placeId] }),
  downloadPlaceQrCode: (profileId: string, placeId: string, format: QrFormat = 'png') =>
    action<{ dataUrl: string }>('app', 'downloadPlaceQrCode', { args: [profileId, placeId, format] }),
  saveGeolocation: (profileId: string, data: FormPayload) =>
    action('app', 'saveGeolocation', { args: [profileId, data] }),
  deleteGeolocation: (profileId: string) => action('app', 'deleteGeolocation', { args: [profileId] }),
}

/* ------------------------------------------------------------------------ */
/* Plain HTTP routes the app calls directly (relative to the APP origin).    */
/* All but qrScan and careerUpload need the bearer token.                    */
/* ------------------------------------------------------------------------ */

export type SearchMode = 'relative' | 'pet' | 'guarded-relative'

const qs = (params: Record<string, string | undefined>) => {
  const pairs = Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : ''
}

export const appHttp = {
  /** GET → up to 8 profiles. q needs 3+ characters (1 in pet mode; optional in guarded-relative). */
  search: (q: string, mode?: SearchMode) => `/api/search${qs({ q, mode })}`,
  /** GET → WikiTree people matching q (3+ characters). */
  wikitreeSearch: (q: string) => `/api/wikitree/search${qs({ q })}`,
  /** GET → one WikiTree profile to import. */
  wikitreeProfile: (id: string) => `/api/wikitree/profile${qs({ id })}`,
  /** GET → address suggestions for a postal code. */
  addressSuggestions: (zip: string) => `/api/address/suggestions${qs({ zip })}`,
  /** GET → place suggestions for the geolocation / place forms. */
  geolocationPlaces: (q: string) => `/api/geolocation/places${qs({ q })}`,
  /** GET → the document file (PDF stream or a redirect); private ones only for a manager. */
  documentFile: (documentId: string) => `/api/documents/${encodeURIComponent(documentId)}/file`,
  /** POST (media upload handshake, clientPayload { profileId }); DELETE { url, clientPayload } removes a staged image. */
  bioUpload: () => '/api/bio/upload',
  galleryUpload: () => '/api/gallery/upload',
  documentsUpload: () => '/api/documents/upload',
  placesUpload: () => '/api/places/upload',
  geolocationUpload: () => '/api/geolocation/upload',
  tributeUpload: () => '/api/tribute/upload',
  /** CV attached to career feedback. */
  careerUpload: () => '/api/career/upload',
  /** POST { profileId } → counts a plaque visit (public, rate-limited). */
  qrScan: () => '/api/analytics/qr-scan',
}
