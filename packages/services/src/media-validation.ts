import type { MediaUploadFile, MediaUploadPolicy } from './media-storage'

export function validateFile(file: MediaUploadFile, policy: MediaUploadPolicy): void {
  if (!policy.allowedContentTypes.includes(file.type)) {
    throw new Error('File type is not allowed')
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new Error('File is empty')
  }
  if (file.size > policy.maximumSizeInBytes) {
    throw new Error(`File exceeds the ${policy.maximumSizeInBytes} byte limit`)
  }
}

export function sanitizePrefix(prefix: string): string {
  const sanitized = prefix
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/')
  if (!sanitized) throw new Error('Invalid media prefix')
  return sanitized
}

export function sanitizeBlobName(name: string): string {
  const parts = name
    .split('/')
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .filter(Boolean)
  if (parts.length === 0) throw new Error('Invalid media object name')
  return parts.join('/')
}

export function extensionFor(contentType: string): string {
  const extensions: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
  }
  return extensions[contentType] ?? 'bin'
}

export function hasExpectedSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (contentType === 'image/gif') {
    const signature = bytes.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (contentType === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (contentType === 'application/pdf') {
    return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  }
  if (contentType === 'video/webm') {
    return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  }
  if (contentType === 'video/mp4' || contentType === 'video/quicktime' || contentType === 'video/x-m4v') {
    return bytes.includes(Buffer.from('ftyp'))
  }
  return false
}
