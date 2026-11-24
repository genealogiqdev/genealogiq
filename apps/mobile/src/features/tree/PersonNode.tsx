import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { memo } from 'react'
import { Text, View } from 'react-native'
import type { TreePerson } from '@/api/app'
import type { Palette } from '@/theme'
import { NODE_H, NODE_W } from './layout'

/** Gender ring and compare-pick colours, mirroring the web card (rose / blue are fixed hues there too). */
export const ROSE = '#E06C82'
export const PICK_ONE = '#3B82F6'

export function personName(person: Pick<TreePerson, 'firstName' | 'lastName' | 'role'>): string {
  return person.role === 'APP_PET' || !person.lastName ? person.firstName : `${person.firstName} ${person.lastName}`
}

export function personInitials(person: Pick<TreePerson, 'firstName' | 'lastName' | 'role'>): string {
  return person.role === 'APP_PET'
    ? person.firstName.slice(0, 2).toUpperCase()
    : `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase()
}

/** Years come from the always-populated year fields so a redacted person still shows them. */
export function personYears(person: Pick<TreePerson, 'birthYear' | 'deathYear'>): string {
  const birth = person.birthYear != null ? String(person.birthYear) : ''
  return person.deathYear != null ? `${birth || '—'} – ${person.deathYear}` : birth
}

export function genderColor(gender: string | null, palette: Palette): string {
  return gender === 'FEMALE' ? ROSE : gender === 'MALE' ? palette.accent : palette.border
}

export interface NodeLabels {
  you: string
  pending: string
  memorial: string
  pet: string
  duplicate: string
  root: string
  expand: string
  collapse: string
}

interface Props {
  person: TreePerson
  displayName: string
  left: number
  top: number
  palette: Palette
  labels: NodeLabels
  isRoot: boolean
  isSessionUser: boolean
  isSelected: boolean
  isDuplicate: boolean
  hasCollapsible: boolean
  isCollapsed: boolean
  collapseDirection: 'up' | 'down'
  isOnPath: boolean
  pickIndex: 0 | 1 | 2
}

/** Half the side of the collapse toggle, in world units (also used for hit-testing). */
export const TOGGLE_R = 11

function PersonNodeBase({
  person,
  displayName,
  left,
  top,
  palette,
  labels,
  isRoot,
  isSessionUser,
  isSelected,
  isDuplicate,
  hasCollapsible,
  isCollapsed,
  collapseDirection,
  isOnPath,
  pickIndex,
}: Props) {
  const isGhost = person.role === 'APP_GHOST'
  const isMemorial = person.role === 'APP_MEMO'
  const isPet = person.role === 'APP_PET'
  const isPending = person.pending && !isRoot
  const dashed = isGhost || isPending || isDuplicate
  const years = personYears(person)
  const petSubtitle = [person.petBreed, person.petSpecies].filter(Boolean).join(', ')

  const pathColor = pickIndex === 1 ? PICK_ONE : pickIndex === 2 ? palette.success : palette.warning
  const borderColor = isSelected ? palette.accent : isOnPath ? pathColor : isRoot ? palette.accent : palette.border
  const emphasised = isSelected || isOnPath || isRoot

  const states = [
    isRoot ? labels.root : null,
    isSessionUser ? labels.you : null,
    isPending ? labels.pending : null,
    isMemorial ? labels.memorial : null,
    isPet ? labels.pet : null,
    isDuplicate ? labels.duplicate : null,
  ].filter(Boolean)

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={[displayName, years, ...states].filter(Boolean).join(', ')}
      className="absolute flex-row items-center rounded-xl bg-surface"
      style={{
        left,
        top,
        width: NODE_W,
        height: NODE_H,
        paddingHorizontal: 10,
        gap: 10,
        borderWidth: emphasised ? 2 : 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor,
        opacity: isPending ? 0.6 : isDuplicate ? 0.7 : 1,
      }}
    >
      <View
        className="items-center justify-center bg-default"
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: genderColor(person.gender, palette), overflow: 'hidden' }}
      >
        {person.avatarUrl ? (
          <Image
            source={{ uri: person.avatarUrl }}
            style={{ width: 36, height: 36, borderRadius: 18, opacity: isMemorial ? 0.85 : 1 }}
            contentFit="cover"
            recyclingKey={person.id}
          />
        ) : isPet ? (
          <Ionicons name="paw" size={16} color={palette.muted} />
        ) : (
          <Text className="font-semibold text-muted" style={{ fontSize: 11 }}>
            {personInitials(person) || '?'}
          </Text>
        )}
      </View>

      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text
          numberOfLines={person.nickname || (isPet && petSubtitle) ? 1 : 2}
          className={isGhost || isPending ? 'font-semibold text-muted' : 'font-semibold text-foreground'}
          style={{ fontSize: 11.5, lineHeight: 14, fontStyle: isGhost || isPending ? 'italic' : 'normal' }}
        >
          {displayName}
        </Text>
        {person.nickname ? (
          <Text numberOfLines={1} className="text-muted" style={{ fontSize: 10, lineHeight: 12, fontStyle: 'italic' }}>
            “{person.nickname}”
          </Text>
        ) : isPet && petSubtitle ? (
          <Text numberOfLines={1} className="text-muted" style={{ fontSize: 10, lineHeight: 12 }}>
            {petSubtitle}
          </Text>
        ) : null}
        {years ? (
          <Text numberOfLines={1} className="text-muted" style={{ fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] }}>
            {years}
          </Text>
        ) : null}
      </View>

      {isRoot ? (
        <View
          className="absolute items-center justify-center"
          style={{ top: -8, left: -8, width: 18, height: 18, borderRadius: 9, backgroundColor: palette.accent }}
        >
          <Ionicons name="star" size={10} color={palette.afg} />
        </View>
      ) : null}

      {pickIndex ? (
        <View
          className="absolute items-center justify-center"
          style={{ top: -8, right: -8, width: 18, height: 18, borderRadius: 9, backgroundColor: pathColor }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{pickIndex}</Text>
        </View>
      ) : null}

      {hasCollapsible ? (
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={isCollapsed ? labels.expand : labels.collapse}
          className="absolute items-center justify-center bg-background"
          style={{
            left: NODE_W / 2 - TOGGLE_R,
            [collapseDirection === 'up' ? 'top' : 'bottom']: -TOGGLE_R,
            width: TOGGLE_R * 2,
            height: TOGGLE_R * 2,
            borderRadius: TOGGLE_R,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Ionicons name={isCollapsed ? 'add' : 'remove'} size={13} color={palette.muted} />
        </View>
      ) : null}

      {isSessionUser || isMemorial || isPet || isPending || isDuplicate ? (
        <View className="absolute flex-row items-center" style={{ right: 4, bottom: 3, gap: 3 }}>
          {isDuplicate ? <Ionicons name="git-branch-outline" size={10} color={palette.muted} /> : null}
          {isPending ? (
            <Text style={{ fontSize: 8, fontWeight: '600', color: palette.warning, textTransform: 'uppercase' }}>{labels.pending}</Text>
          ) : null}
          {isMemorial ? <Ionicons name="book-outline" size={10} color={palette.muted} /> : null}
          {isPet && person.avatarUrl ? <Ionicons name="paw-outline" size={10} color={palette.muted} /> : null}
          {isSessionUser ? (
            <View style={{ backgroundColor: palette.accent, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
              <Text style={{ fontSize: 8, fontWeight: '700', color: palette.afg, textTransform: 'uppercase' }}>{labels.you}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/** Memoised: a pan or zoom never re-renders a card, only a data or selection change does. */
export const PersonNode = memo(PersonNodeBase)
