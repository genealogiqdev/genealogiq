import { Redirect, usePathname } from 'expo-router'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { SystemId } from '@/config'
import { LoadingState } from '@/ui'
import { useSession } from './session'

/**
 * Wraps a system's navigator. Without a session for that system the user is
 * sent to sign-in with the system preselected. If a deep link lands in a
 * system other than the active one, that system becomes active (its own
 * session is still required: sessions are never shared across systems).
 */
export function RequireSession({ system, children }: { system: SystemId; children: ReactNode }) {
  const session = useSession((state) => state.sessions[system])
  const active = useSession((state) => state.active)
  const switchTo = useSession((state) => state.switchTo)
  const select = useSession((state) => state.select)
  const pathname = usePathname()

  useEffect(() => {
    if (session && active !== system) void switchTo(system)
    if (!session) select(system)
  }, [session, active, system, switchTo, select])

  if (!session) {
    return <Redirect href={{ pathname: '/sign-in', params: { system, ...(system === 'app' ? { callbackUrl: pathname } : {}) } }} />
  }
  if (active !== system) return <LoadingState />
  return <>{children}</>
}
