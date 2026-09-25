const LEGACY_VERCEL_BLOB_PATTERN =
  /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//
const AZURE_MEDIA_BLOB_PATTERN =
  /^https:\/\/[a-z0-9]{3,24}\.blob\.core\.windows\.net\/media\//

/**
 * Transitional pattern retained for schemas/tests that still use `.regex()`.
 * New code should call `isAllowedMediaUrl`, which pins Azure URLs to the
 * configured account while continuing to accept legacy Vercel references
 * during the migration window.
 */
export const BLOB_URL_PATTERN =
  /^https:\/\/(?:[^/]+\.public\.blob\.vercel-storage\.com\/|[a-z0-9]{3,24}\.blob\.core\.windows\.net\/media\/)/

export function isAllowedMediaUrl(value: string): boolean {
  if (LEGACY_VERCEL_BLOB_PATTERN.test(value)) return true

  const configuredBase = (
    process.env.MEDIA_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL
  )?.replace(/\/+$/, '')
  if (configuredBase) {
    try {
      const expected = new URL(configuredBase)
      const candidate = new URL(value)
      return (
        candidate.origin === expected.origin &&
        candidate.pathname.startsWith(`${expected.pathname.replace(/\/+$/, '')}/`)
      )
    } catch {
      return false
    }
  }

  // Client-side validation cannot read server-only runtime configuration.
  // The issuing API still pins the account and generated key.
  return AZURE_MEDIA_BLOB_PATTERN.test(value)
}

export function isLegacyVercelBlobUrl(value: string): boolean {
  return LEGACY_VERCEL_BLOB_PATTERN.test(value)
}
