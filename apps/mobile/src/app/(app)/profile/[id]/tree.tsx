import { useLocalSearchParams } from 'expo-router'
import { TreeScreen } from '@/features/tree/TreeScreen'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** `/profile/[id]/tree?focus=<id>` — public: visitors get the read-only canvas. */
export default function ProfileTreeRoute() {
  const params = useLocalSearchParams<{ id: string; focus?: string }>()
  const id = first(params.id) ?? ''
  // Keyed by profile so a pet redirect or a jump to another tree starts from a clean screen.
  return <TreeScreen key={id} profileId={id} focus={first(params.focus) ?? null} />
}
