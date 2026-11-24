import { useRouter } from 'expo-router'
import { View } from 'react-native'
import type { AppRole } from '@/api/app'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { formatDate } from '@/lib/format'
import { Avatar, Badge, Card, Divider, ListRow } from '@/ui'
import { countryName } from './countries'

/** The fields a list card needs; `ProfileCard`, search results and recently-viewed rows all fit. */
export interface CardProfile {
  id: string
  firstName: string
  lastName?: string | null
  avatarUrl: string | null
  role: AppRole | string
  birthDate?: string | null
  deathDate?: string | null
  birthYear?: number | null
  deathYear?: number | null
  birthPlace?: string | null
  birthCountry?: string | null
  petSpecies?: string | null
  petBreed?: string | null
}

export function fullName(profile: { firstName: string; lastName?: string | null }): string {
  return profile.lastName ? `${profile.firstName} ${profile.lastName}`.trim() : profile.firstName
}

/** Date-only values (birth, death) are calendar dates: always shown in UTC. */
export function longDate(value: string | null | undefined): string {
  return formatDate(value, { utc: true, month: 'long' })
}

/** Subtitle of a profile card, in the wording of the web home cards. */
export function useProfileSubtitle(): (profile: CardProfile) => string {
  const t = useT('Home')
  const locale = useLocale((state) => state.locale)
  return (profile) => {
    if (profile.role === 'APP_PET') {
      const pet = [profile.petSpecies, profile.petBreed].filter(Boolean).join(' · ')
      if (pet) return pet
    }
    if (profile.role === 'APP_MEMO' || profile.deathDate || profile.deathYear) {
      const from = profile.birthDate ? new Date(profile.birthDate).getUTCFullYear() : profile.birthYear
      const to = profile.deathDate ? new Date(profile.deathDate).getUTCFullYear() : profile.deathYear
      if (from || to) return `${from ?? '?'} – ${to ?? '?'}`
      return t('memorializedProfile')
    }
    if (profile.birthDate) return t('bornMetric', { date: longDate(profile.birthDate) })
    if (profile.birthYear) return t('bornYearMetric', { year: profile.birthYear })
    return [profile.birthPlace, countryName(profile.birthCountry, locale)].filter(Boolean).join(', ')
  }
}

function RoleBadge({ role }: { role: string }) {
  const t = useT('Home')
  if (role === 'APP_MEMO') return <Badge label={t('memorializedBadge')} color="accent" />
  if (role === 'APP_PET') return <Badge label={t('petBadge')} color="warning" />
  return null
}

export function ProfileRow({ profile, onPress, right }: { profile: CardProfile; onPress?: () => void; right?: React.ReactNode }) {
  const router = useRouter()
  const subtitle = useProfileSubtitle()
  const name = fullName(profile)
  return (
    <ListRow
      title={name}
      subtitle={subtitle(profile) || undefined}
      left={<Avatar uri={profile.avatarUrl} name={name} size={48} />}
      right={right ?? <RoleBadge role={profile.role} />}
      onPress={onPress ?? (() => router.push(`/profile/${profile.id}`))}
    />
  )
}

/** A card holding profile rows separated by dividers. */
export function ProfileList({ profiles, renderRight }: { profiles: readonly CardProfile[]; renderRight?: (profile: CardProfile) => React.ReactNode }) {
  return (
    <Card>
      {profiles.map((profile, index) => (
        <View key={profile.id}>
          {index > 0 ? <Divider /> : null}
          <ProfileRow profile={profile} right={renderRight?.(profile)} />
        </View>
      ))}
    </Card>
  )
}
