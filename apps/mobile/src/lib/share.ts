import * as Clipboard from 'expo-clipboard'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as WebBrowser from 'expo-web-browser'
import { Linking, Platform } from 'react-native'
import { absoluteUrl, authHeaders } from '@/api/client'
import type { SystemId } from '@/config'

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_')

async function writeCache(name: string, content: string, encoding: 'utf8' | 'base64'): Promise<string> {
  const uri = `${LegacyFileSystem.cacheDirectory}${safeName(name)}`
  await LegacyFileSystem.writeAsStringAsync(uri, content, {
    encoding: encoding === 'base64' ? LegacyFileSystem.EncodingType.Base64 : LegacyFileSystem.EncodingType.UTF8,
  })
  return uri
}

function webDownload(name: string, href: string): void {
  const doc = (globalThis as { document?: { createElement: (tag: string) => { href: string; download: string; click: () => void } } }).document
  if (!doc) return
  const anchor = doc.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.click()
}

/** Hand a generated file to the system share sheet (save to Files, send, print…). */
export async function shareFile(name: string, content: string, options: { mimeType: string; encoding?: 'utf8' | 'base64' }): Promise<void> {
  const encoding = options.encoding ?? 'utf8'
  if (Platform.OS === 'web') {
    webDownload(name, encoding === 'base64' ? `data:${options.mimeType};base64,${content}` : `data:${options.mimeType};charset=utf-8,${encodeURIComponent(content)}`)
    return
  }
  const uri = await writeCache(name, content, encoding)
  await Sharing.shareAsync(uri, { mimeType: options.mimeType, dialogTitle: name })
}

/** Save a base64 PNG to the photo library. Returns false when permission is refused. */
export async function savePngToPhotos(name: string, base64: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    webDownload(name, `data:image/png;base64,${base64}`)
    return true
  }
  const permission = await MediaLibrary.requestPermissionsAsync(true)
  if (!permission.granted) return false
  const uri = await writeCache(name, base64, 'base64')
  await MediaLibrary.saveToLibraryAsync(uri)
  return true
}

/** Send HTML to the native print dialog (also offers "Save as PDF"). */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html })
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text)
}

/** Open a web page (Stripe checkout, billing portal, terms) in the in-app browser; resolves when it closes. */
export async function openInBrowser(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
}

export async function openExternal(url: string): Promise<void> {
  await Linking.openURL(url)
}

/**
 * Download a file that needs the session (a private document) and open it in
 * the share/preview sheet. The token travels in a header, never in the URL.
 */
export async function openProtectedFile(system: SystemId, path: string, name: string, mimeType: string): Promise<void> {
  const url = absoluteUrl(system, path)
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers: authHeaders(system) })
    const blob = await response.blob()
    const objectUrl = (globalThis as unknown as { URL: { createObjectURL: (blob: Blob) => string } }).URL.createObjectURL(blob)
    webDownload(name, objectUrl)
    return
  }
  const target = `${LegacyFileSystem.cacheDirectory}${safeName(name)}`
  const result = await LegacyFileSystem.downloadAsync(url, target, { headers: authHeaders(system) })
  if (result.status < 200 || result.status >= 300) throw new Error(`download ${result.status}`)
  await Sharing.shareAsync(result.uri, { mimeType, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined, dialogTitle: name })
}
