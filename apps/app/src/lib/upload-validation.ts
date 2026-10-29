export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
export const ALLOWED_IMAGE_EXTS  = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const
export const ALLOWED_VIDEO_EXTS  = [".mp4", ".webm", ".mov", ".m4v", ".qt"] as const

export const IMAGE_FORMATS_LABEL = "JPG, PNG, WebP or GIF"
// SVG portraits are rasterized before upload; storage never receives active SVG.
export const PET_AVATAR_ACCEPT = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_IMAGE_EXTS, "image/svg+xml", ".svg"].join(",")
export const PET_AVATAR_FORMATS_LABEL = "JPG, PNG, WebP, GIF, SVG"
export const VIDEO_FORMATS_LABEL = "MP4, WebM or MOV (QuickTime)"

// Some Windows browsers send empty MIME for certain formats — fall back to extension.
function hasAllowedTypeOrExt(file: File, types: readonly string[], exts: readonly string[]): boolean {
  if (types.includes(file.type)) return true
  const dot = file.name.lastIndexOf(".")
  if (dot < 0) return false
  return exts.includes(file.name.slice(dot).toLowerCase())
}

export const isAllowedImage = (file: File) => hasAllowedTypeOrExt(file, ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTS)
export const isAllowedPetAvatar = (file: File) => isAllowedImage(file) || file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
export const isAllowedVideo = (file: File) => hasAllowedTypeOrExt(file, ALLOWED_VIDEO_TYPES, ALLOWED_VIDEO_EXTS)
