export interface MediaUploadOptions {
  access?: 'public'
  handleUploadUrl: string
  contentType?: string
  clientPayload?: string
}

export interface UploadedMedia {
  url: string
}

interface AuthorizedUploadResponse {
  url: string
  uploadUrl: string
  headers: Record<string, string>
}

/**
 * Browser-direct Azure upload with a short-lived, single-blob SAS issued by
 * the application's existing upload route.
 */
export async function uploadMedia(
  pathname: string,
  body: Blob,
  options: MediaUploadOptions,
): Promise<UploadedMedia> {
  const contentType = options.contentType || body.type || 'application/octet-stream'
  const name = pathname.split('/').filter(Boolean).at(-1) || 'upload'
  const authorize = await postJson<AuthorizedUploadResponse>(options.handleUploadUrl, {
    type: 'media.upload.authorize',
    file: { name, type: contentType, size: body.size },
    clientPayload: options.clientPayload ?? null,
  })

  const response = await fetch(authorize.uploadUrl, {
    method: 'PUT',
    headers: authorize.headers,
    body,
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }

  const completed = await postJson<UploadedMedia>(options.handleUploadUrl, {
    type: 'media.upload.complete',
    url: authorize.url,
    clientPayload: options.clientPayload ?? null,
  })
  return { url: completed.url }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(json.error || `Upload request failed (${response.status})`)
  }
  return json
}
