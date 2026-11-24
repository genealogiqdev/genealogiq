import { usePathname, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useSession, type SessionUser } from '@/auth/session'

/**
 * Guard for a signed-in-only Genealogiq screen that lives outside the tab
 * group (the `(app)` stack itself is public so profiles and `/qr/[genCode]`
 * open signed out). Without an app session the user is sent to
 * `/sign-in?system=app&callbackUrl=<path>` and comes back after signing in.
 *
 * Returns the signed-in user, or null while the redirect is under way: render
 * `<LoadingState />` for null.
 */
export function useRequireAppSession(): SessionUser | null {
  const ready = useSession((state) => state.ready)
  const user = useSession((state) => state.sessions.app?.user ?? null)
  const select = useSession((state) => state.select)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!ready || user) return
    select('app')
    router.replace({ pathname: '/sign-in', params: { system: 'app', callbackUrl: pathname } })
  }, [ready, user, pathname, router, select])

  return user
}

/** The signed-in Genealogiq user without redirecting (null for a visitor). */
export function useAppUser(): SessionUser | null {
  return useSession((state) => state.sessions.app?.user ?? null)
}
