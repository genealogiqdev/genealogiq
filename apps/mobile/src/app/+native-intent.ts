import { LINK_HOSTS } from '@/config'

/**
 * Links from emails and QR plaques point at the three web hosts. The path is
 * the same on every host (`/reset-password`, `/verify-email`), so the host is
 * turned into a `system` parameter before routing; consumer links (`/qr/…`,
 * `/profile/…`) already match the app's own routes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, 'genealogiq://app')
    const system = LINK_HOSTS[url.hostname.toLowerCase()]
    if (!system) return path

    // The email-verification link on the web is an API route that signs the browser in.
    const pathname = url.pathname === '/api/verify-email' ? '/verify-email' : url.pathname
    if (pathname === '/reset-password' || pathname === '/verify-email' || pathname === '/sign-in' || pathname === '/forgot-password') {
      url.searchParams.set('system', system)
    }
    const search = url.searchParams.toString()
    return `${pathname}${search ? `?${search}` : ''}`
  } catch {
    return path
  }
}
