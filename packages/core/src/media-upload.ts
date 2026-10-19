export interface MediaUploadOptions {
  access?: 'public'
  handleUploadUrl: string
  contentType?: string
  clientPayload?: string
}

export interface UploadedMedia {
  url: string
}

interface AzureAuthorizedUploadResponse {
  provider?: 'azure'
  url: string
  uploadUrl: string
  headers: Record<string, string>
}

type AuthorizedUploadResponse = AzureAuthorizedUploadResponse | {
  provider: 'vercel'
  pathname: string
  clientToken: string
  access: 'private'
}

/** Browser-direct upload with server-issued scope and verified completion. */
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

  let uploadedUrl: string
  if (authorize.provider === 'vercel') {
    const { put } = await import('@vercel/blob/client')
    const uploaded = await put(authorize.pathname, body, {
      token: authorize.clientToken, access: 'private', contentType,
      multipart: body.size > 8 * 1024 * 1024,
    })
    uploadedUrl = uploaded.url
  } else {
    const response = await fetch(authorize.uploadUrl, {
      method: 'PUT',
      headers: authorize.headers,
      body,
    })
    if (!response.ok) {
      throw new Error(`Upload failed (${response.status})`)
    }
    uploadedUrl = authorize.url
  }

  const completed = await postJson<UploadedMedia>(options.handleUploadUrl, {
    type: 'media.upload.complete',
    url: uploadedUrl,
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
