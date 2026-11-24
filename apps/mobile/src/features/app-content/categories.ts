// Stable category keys, mirrored from apps/app/src/consts/{place,document}-categories.ts
// (the mobile app never imports server code). Labels come from the web catalogue:
// `Places.cat_<key>`, `Places.catgroup_<group>`, `Documents.cat_<key>`.

export const PLACE_CATEGORY_GROUPS = [
  { group: 'origins', categories: ['birth', 'childhood_home', 'baptism_church'] },
  { group: 'education', categories: ['school', 'university', 'course'] },
  { group: 'relationships', categories: ['first_kiss', 'first_date', 'wedding', 'honeymoon'] },
  { group: 'family', categories: ['family_home', 'grandparents_home', 'children_birth'] },
  { group: 'work', categories: ['first_job', 'workplace', 'business'] },
  { group: 'leisure', categories: ['vacation_spot', 'hobby', 'favorite_place', 'travel', 'sport'] },
  { group: 'milestones', categories: ['achievement', 'military_service', 'immigration'] },
  { group: 'final', categories: ['resting_place', 'memorial_site'] },
] as const

export const PLACE_CATEGORIES: readonly string[] = PLACE_CATEGORY_GROUPS.flatMap((group) => [...group.categories])

export const DOCUMENT_CATEGORIES = [
  'birth_certificate',
  'marriage_certificate',
  'death_certificate',
  'identity_document',
  'medical',
  'education',
  'immigration',
  'military',
  'legal',
  'correspondence',
  'other',
] as const

export const PLACE_MAX_PHOTOS = 6
export const GEOLOCATION_MAX_PHOTOS = 3

/** Upload-route size limits (bytes), mirrored from apps/app/src/app/api/<module>/upload/route.ts. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 300
