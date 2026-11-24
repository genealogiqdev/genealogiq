import { Redirect } from 'expo-router'
import { useRequireAppSession } from '@/features/app/session'
import { LoadingState } from '@/ui'

/** `/profile` opens the signed-in user's own profile. */
export default function MyProfile() {
  const user = useRequireAppSession()
  if (!user) return <LoadingState />
  return <Redirect href={`/profile/${user.id}`} />
}
