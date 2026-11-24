import { Redirect } from 'expo-router'
import { useSession } from '@/auth/session'
import { SYSTEM_META } from '@/config'

/** Entry point: the active system's home when signed in, otherwise the sign-in screen. */
export default function Index() {
  const active = useSession((state) => (state.active && state.sessions[state.active] ? state.active : null))
  return <Redirect href={active ? SYSTEM_META[active].home : '/sign-in'} />
}
