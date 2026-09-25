import { createHash } from 'node:crypto'

export function legacyDestinationName(sourceUrl: string, pathname: string): string {
  const digest = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20)
  const leaf =
    pathname.split('/').filter(Boolean).at(-1)?.replace(/[^a-zA-Z0-9._-]/g, '_') ||
    'object'
  return `legacy/${digest}/${leaf}`
}

export function replaceMediaArray(
  current: readonly string[],
  replacements: ReadonlyMap<string, string>,
): { changed: boolean; value: string[] } {
  const value = current.map((url) => replacements.get(url) ?? url)
  return {
    changed: value.some((url, index) => url !== current[index]),
    value,
  }
}

export function isReferencedObjectReadyForRewrite(item: {
  references: readonly unknown[]
  destinationUrl: string | null
  copiedAt: string | null
  verifiedAt: string | null
  errors: readonly string[]
}): boolean {
  return (
    item.references.length === 0 ||
    Boolean(item.destinationUrl && item.copiedAt && item.verifiedAt && item.errors.length === 0)
  )
}
