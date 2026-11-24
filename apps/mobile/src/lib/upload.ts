import * as DocumentPicker from 'expo-document-picker'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'
import { ApiError, http } from '@/api/client'
import type { SystemId } from '@/config'

export interface LocalFile {
  uri: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'video' | 'document'
  width?: number
  height?: number
}

export class PermissionDeniedError extends Error {
  constructor() {
    super('permissionDenied')
    this.name = 'PermissionDeniedError'
  }
}

const MAX_IMAGE_EDGE = 2048

async function fileSize(uri: string, fallback = 0): Promise<number> {
  if (Platform.OS === 'web') return fallback
  try {
    const info = await LegacyFileSystem.getInfoAsync(uri)
    return info.exists && typeof info.size === 'number' ? info.size : fallback
  } catch {
    return fallback
  }
}

/**
 * Re-encode a picked photo as JPEG no larger than 2048px on its long edge.
 * This is the native counterpart of the web's canvas compression, and it also
 * converts HEIC photos, which the upload routes do not accept.
 */
export async function compressImage(asset: { uri: string; width?: number; height?: number; fileName?: string | null }): Promise<LocalFile> {
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0)
  const actions: ImageManipulator.Action[] =
    longEdge > MAX_IMAGE_EDGE
      ? [{ resize: (asset.width ?? 0) >= (asset.height ?? 0) ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE } }]
      : []
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '')
  return {
    uri: result.uri,
    name: `${base || 'photo'}.jpg`,
    mimeType: 'image/jpeg',
    size: await fileSize(result.uri),
    kind: 'image',
    width: result.width,
    height: result.height,
  }
}

async function fromPickerAssets(assets: ImagePicker.ImagePickerAsset[]): Promise<LocalFile[]> {
  const files: LocalFile[] = []
  for (const asset of assets) {
    if (asset.type === 'video') {
      const name = asset.fileName ?? `video-${Date.now()}.mp4`
      files.push({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType ?? (name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'),
        size: asset.fileSize ?? (await fileSize(asset.uri)),
        kind: 'video',
        width: asset.width,
        height: asset.height,
      })
    } else {
      files.push(await compressImage(asset))
    }
  }
  return files
}

export async function pickMedia(options: { multiple?: boolean; allowVideo?: boolean; limit?: number } = {}): Promise<LocalFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) throw new PermissionDeniedError()
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options.allowVideo ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!options.multiple,
    selectionLimit: options.multiple ? (options.limit ?? 0) : 1,
    quality: 1,
    // Ask the OS for a compatible, moderately sized video instead of the camera original.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  })
  return result.canceled ? [] : fromPickerAssets(result.assets)
}

export async function takePhoto(): Promise<LocalFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) throw new PermissionDeniedError()
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
  if (result.canceled || !result.assets[0]) return null
  return compressImage(result.assets[0])
}

export async function pickPdf(): Promise<LocalFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false })
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: 'application/pdf',
    size: asset.size ?? (await fileSize(asset.uri)),
    kind: 'document',
  }
}

interface AzureAuthorization {
  provider?: 'azure'
  url: string
  uploadUrl: string
  headers: Record<string, string>
}
interface VercelAuthorization {
  provider: 'vercel'
  pathname: string
  clientToken: string
  access: 'private'
}

// Vercel Blob client-token upload, written against the request the official
// client makes for a single PUT (@vercel/blob 2.8: api version 13). The
// official package cannot be bundled for React Native because it imports
// Node-only modules. If the server's @vercel/blob major version changes,
// re-check this request against its `put` implementation.
const VERCEL_BLOB_API = 'https://vercel.com/api/blob'
const VERCEL_BLOB_API_VERSION = '13'

async function putVercelBlob(authorization: VercelAuthorization, file: LocalFile): Promise<string> {
  const url = `${VERCEL_BLOB_API}/?${new URLSearchParams({ pathname: authorization.pathname }).toString()}`
  // The store id is the fourth underscore-separated part of the token.
  const storeId = authorization.clientToken.split('_')[3] ?? ''
  const headers: Record<string, string> = {
    authorization: `Bearer ${authorization.clientToken}`,
    'x-api-version': VERCEL_BLOB_API_VERSION,
    'x-vercel-blob-store-id': storeId,
    'x-vercel-blob-access': authorization.access,
    'x-content-type': file.mimeType,
  }

  let status: number
  let body: string
  if (Platform.OS === 'web') {
    const response = await fetch(url, { method: 'PUT', headers, body: await readBlob(file.uri) })
    status = response.status
    body = await response.text()
  } else {
    const result = await LegacyFileSystem.uploadAsync(url, file.uri, {
      httpMethod: 'PUT',
      headers,
      uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    })
    status = result.status
    body = result.body
  }
  if (status < 200 || status >= 300) throw new ApiError(status, 'serverError')
  const uploaded = JSON.parse(body) as { url?: unknown }
  if (typeof uploaded.url !== 'string') throw new ApiError(502, 'serverError')
  return uploaded.url
}

async function readBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri)
  return response.blob()
}

/**
 * Upload one file through a system's two-phase upload route
 * (authorize → direct upload to storage → complete), returning the final
 * media URL to hand to the save action. The server decides the storage path,
 * allowed types and size limit, and re-verifies the bytes on completion.
 */
export async function uploadFile(
  system: SystemId,
  routePath: string,
  file: LocalFile,
  clientPayload?: Record<string, unknown> | null,
): Promise<string> {
  const payload = clientPayload ? JSON.stringify(clientPayload) : null
  const authorization = await http<AzureAuthorization | VercelAuthorization>(system, routePath, {
    method: 'POST',
    body: JSON.stringify({
      type: 'media.upload.authorize',
      file: { name: file.name, type: file.mimeType, size: file.size },
      clientPayload: payload,
    }),
  })

  let uploadedUrl: string
  if (authorization.provider === 'vercel') {
    uploadedUrl = await putVercelBlob(authorization, file)
  } else if (Platform.OS === 'web') {
    const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: await readBlob(file.uri) })
    if (!response.ok) throw new ApiError(response.status, 'serverError')
    uploadedUrl = authorization.url
  } else {
    // Streams from disk, so a 100 MB video never has to fit in memory.
    const result = await LegacyFileSystem.uploadAsync(authorization.uploadUrl, file.uri, {
      httpMethod: 'PUT',
      headers: authorization.headers,
      uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    })
    if (result.status < 200 || result.status >= 300) throw new ApiError(result.status, 'serverError')
    uploadedUrl = authorization.url
  }

  const completed = await http<{ url: string }>(system, routePath, {
    method: 'POST',
    body: JSON.stringify({ type: 'media.upload.complete', url: uploadedUrl, clientPayload: payload }),
  })
  return completed.url
}
