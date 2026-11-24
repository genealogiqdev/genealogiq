import { Image } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text as RNText, View } from 'react-native'
import { appApi, appHttp, type ProfileCard, type ProfileSection, type ProfileView, type QrFormat } from '@/api/app'
import { http } from '@/api/client'
import { countryName } from '@/features/app/countries'
import { fullName, longDate } from '@/features/app/ProfileCards'
import { useRecordRecentlyViewed } from '@/features/app/recent'
import { SignUpPrompt } from '@/features/app/SignUpPrompt'
import { useAppUser } from '@/features/app/session'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { useInvalidate, useView } from '@/lib/query'
import { shareFile } from '@/lib/share'
import { usePalette } from '@/theme'
import { Avatar, Badge, Button, Card, Heading, Icon, IconButton, Muted, QueryView, Row, Screen, Sheet, Title, useNotify, type IconName } from '@/ui'

const strong = (chunks: unknown) => <RNText className="font-semibold text-foreground">{chunks as ReactNode}</RNText>

/** Splits a `data:` URL into what the share sheet needs. */
function parseDataUrl(dataUrl: string): { mimeType: string; content: string; encoding: 'base64' | 'utf8' } | null {
  const match = /^data:([^;,]+)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const base64 = !!match[3]
  return { mimeType: match[1], content: base64 ? match[4] : decodeURIComponent(match[4]), encoding: base64 ? 'base64' : 'utf8' }
}

function Banner({ data, onRequireAccount }: { data: ProfileView; onRequireAccount: () => void }) {
  const t = useT('Profile')
  const tq = useT('Qr')
  const router = useRouter()
  const notify = useNotify()
  const palette = usePalette('app')
  const locale = useLocale((state) => state.locale)
  const invalidate = useInvalidate('app')
  const { profile, viewer } = data
  const isMemorial = profile.type === 'memorialized'
  const isPet = profile.type === 'pet'
  const name = fullName(profile)

  const [favorited, setFavorited] = useState(viewer.isFavoritedByMe)
  const [favoriteCount, setFavoriteCount] = useState(data.counts.favoritedBy)
  const [toggling, setToggling] = useState(false)
  const [downloading, setDownloading] = useState<QrFormat | null>(null)
  useEffect(() => {
    setFavorited(viewer.isFavoritedByMe)
    setFavoriteCount(data.counts.favoritedBy)
  }, [viewer.isFavoritedByMe, data.counts.favoritedBy])

  async function toggleFavorite() {
    if (toggling) return
    const next = !favorited
    // Optimistic, rolled back when the server refuses.
    setToggling(true)
    setFavorited(next)
    setFavoriteCount((count) => count + (next ? 1 : -1))
    const rollback = () => {
      setFavorited(!next)
      setFavoriteCount((count) => count + (next ? -1 : 1))
    }
    try {
      const result = await appApi.toggleFavorite(profile.id)
      if (!result.ok) {
        rollback()
        notify.error(result.message)
      } else {
        void invalidate(['home'], ['favorites'], ['profile', profile.id])
      }
    } catch (error) {
      rollback()
      notify.error(error)
    } finally {
      setToggling(false)
    }
  }

  async function downloadPetCode(format: QrFormat) {
    setDownloading(format)
    try {
      const result = await appApi.downloadPetQrCode(profile.id, format)
      if (!result.ok) {
        notify.error(result.message)
        return
      }
      const file = result.data ? parseDataUrl(result.data.dataUrl) : null
      if (!file) {
        notify.error(tq('client.downloadFailed'))
        return
      }
      await shareFile(`gencode-${profile.id}.${format}`, file.content, { mimeType: file.mimeType, encoding: file.encoding })
    } catch (error) {
      notify.error(error)
    } finally {
      setDownloading(null)
    }
  }

  const place = (city: string | null, country: string | null) => [city, countryName(country, locale)].filter(Boolean).join(', ')
  const birth = profile.birthDate
    ? place(profile.birthPlace, profile.birthCountry)
      ? t.rich('bornOnInPlace', { date: longDate(profile.birthDate), place: place(profile.birthPlace, profile.birthCountry), strong })
      : t.rich('bornOn', { date: longDate(profile.birthDate), strong })
    : profile.birthYear
      ? t.rich('bornInYear', { year: String(profile.birthYear), strong })
      : null
  const death =
    isMemorial || isPet
      ? profile.deathDate
        ? place(profile.deathPlace, profile.deathCountry)
          ? t.rich('deceasedOnInPlace', { date: longDate(profile.deathDate), place: place(profile.deathPlace, profile.deathCountry), strong })
          : t.rich('deceasedOn', { date: longDate(profile.deathDate), strong })
        : profile.deathYear
          ? t.rich('deceasedInYear', { year: String(profile.deathYear), strong })
          : null
      : null
  const geo = data.geo && (data.geo.lat !== 0 || data.geo.lon !== 0) ? data.geo : null
  const guardians = viewer.isAuthenticated && (isMemorial || isPet) && data.guardians.length > 0 ? data.guardians : null

  const stat = (icon: IconName, value: number, label: string) => (
    <View className="flex-row items-center gap-1 rounded-full bg-default px-2.5 py-1" accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={13} color={palette.dfg} />
      <RNText className="text-xs font-medium text-default-foreground">{value}</RNText>
    </View>
  )

  return (
    <Card>
      <Row className="justify-end gap-1">
        {viewer.canManage ? <IconButton icon="create-outline" label={t('editProfileAria')} onPress={() => router.push(`/profile/${profile.id}/edit`)} /> : null}
        {!viewer.isOwner ? (
          <IconButton
            icon={favorited ? 'heart' : 'heart-outline'}
            color={favorited ? palette.danger : undefined}
            label={favorited ? t('removeFromFavorites') : t('addToFavorites')}
            onPress={viewer.isAuthenticated ? () => void toggleFavorite() : onRequireAccount}
          />
        ) : null}
      </Row>
      <View className="items-center gap-3">
        <Avatar uri={profile.avatarUrl} name={name} size={112} />
        <View className="flex-row flex-wrap items-center justify-center gap-2">
          {isMemorial ? <Badge label={t('memorialized')} color="accent" /> : null}
          {isPet ? <Badge label={t('petBadge')} color="warning" /> : null}
          {stat('images-outline', data.counts.media, t('tooltipMedia'))}
          {!isPet ? stat('flower-outline', data.counts.tributes, t('tooltipTributes')) : null}
          {stat('heart-outline', favoriteCount, t('tooltipFavorites'))}
          {!isMemorial && !isPet ? stat('shield-outline', data.counts.guarded, t('tooltipGuarded')) : null}
        </View>
        <Title className="text-center">{name}</Title>
        {isPet && (profile.petSpecies || profile.petBreed) ? <Muted className="text-center">{[profile.petSpecies, profile.petBreed].filter(Boolean).join(' · ')}</Muted> : null}
      </View>

      <View className="gap-2 pt-1">
        {birth ? (
          <Row className="items-start gap-2">
            <Icon name="gift-outline" size={16} />
            <RNText className="flex-1 text-sm text-muted">{birth}</RNText>
          </Row>
        ) : null}
        {death ? (
          <Row className="items-start gap-2">
            <Icon name="leaf-outline" size={16} />
            <RNText className="flex-1 text-sm text-muted">{death}</RNText>
          </Row>
        ) : null}
        {isMemorial && geo ? (
          <Pressable onPress={() => router.push(`/profile/${profile.id}/geolocation`)} accessibilityRole="link" className="min-h-11 flex-row items-center gap-2">
            <Icon name="location-outline" size={16} />
            <RNText className="flex-1 text-sm text-muted">
              {t('coordinatesLabel')}{' '}
              <RNText className="font-semibold text-link">
                {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}
              </RNText>
            </RNText>
          </Pressable>
        ) : null}
        {guardians ? (
          <View className="flex-row flex-wrap items-center gap-x-1 gap-y-1">
            <Icon name="person-outline" size={16} />
            <RNText className="text-sm text-muted"> {t('guardianLabel', { count: guardians.length })}</RNText>
            {guardians.slice(0, 3).map((guardian, index) => (
              <Pressable key={guardian.id} onPress={() => router.push(`/profile/${guardian.id}`)} accessibilityRole="link" hitSlop={10}>
                <RNText className="text-sm font-semibold text-link">
                  {guardian.firstName}
                  {index < Math.min(guardians.length, 3) - 1 ? ',' : ''}
                </RNText>
              </Pressable>
            ))}
            {guardians.length > 3 ? <RNText className="text-sm text-muted">+{guardians.length - 3}</RNText> : null}
          </View>
        ) : null}
      </View>

      {isMemorial && viewer.canAccessGenCode ? (
        <Button label={t('genCodeLink')} icon="qr-code-outline" variant="secondary" onPress={() => router.push(`/profile/${profile.id}/qr-code`)} fullWidth />
      ) : null}
      {viewer.canDownloadPetGenCode ? (
        <View className="gap-2">
          <Muted>{tq('client.downloadGenCode')}</Muted>
          <Row>
            {(['png', 'svg'] as const).map((format) => (
              <View key={format} className="flex-1">
                <Button
                  label={format.toUpperCase()}
                  icon="download-outline"
                  variant="secondary"
                  loading={downloading === format}
                  disabled={downloading !== null}
                  onPress={() => void downloadPetCode(format)}
                  fullWidth
                />
              </View>
            ))}
          </Row>
        </View>
      ) : null}
    </Card>
  )
}

function Faces({ people }: { people: readonly { id: string; firstName: string; lastName?: string | null; avatarUrl: string | null }[] }) {
  if (people.length === 0) return null
  return (
    <View className="flex-row gap-1">
      {people.slice(0, 5).map((person) => (
        <Avatar key={person.id} uri={person.avatarUrl} name={fullName(person)} size={32} />
      ))}
    </View>
  )
}

interface SectionCardData {
  title: string
  description: string
  metric: string
  icon: IconName
  href: string
  preview?: ReactNode
}

function useSectionCards(data: ProfileView): (section: ProfileSection) => SectionCardData {
  const t = useT('Profile')
  const base = `/profile/${data.profile.id}`
  const { counts, previews } = data
  const cards = (people: readonly ProfileCard[]) => <Faces people={people} />
  return (section) => {
    switch (section) {
      case 'tree':
        return { title: t('treeTitle'), description: t('treeDescription'), metric: counts.treeMembers > 1 ? t('treeMetric', { count: counts.treeMembers }) : t('treeEmptyMetric'), icon: 'git-network-outline', href: `${base}/tree` }
      case 'bio':
        return { title: t('bioTitle'), description: t('bioDescription'), metric: data.hasBio ? t('bioMetric') : t('bioEmptyMetric'), icon: 'book-outline', href: `${base}/bio` }
      case 'documents':
        return {
          title: t('documentsTitle'),
          description: t('documentsDescription'),
          metric: counts.documents > 0 ? t('documentsMetric', { count: counts.documents }) : t('documentsEmptyMetric'),
          icon: 'document-text-outline',
          href: `${base}/documents`,
          preview: previews.documents.length > 0 ? <Muted numberOfLines={1}>{previews.documents.map((document) => document.title).join(' · ')}</Muted> : undefined,
        }
      case 'gallery':
        return {
          title: t('galleryTitle'),
          description: t('galleryDescription'),
          metric: counts.media > 0 ? t('galleryMetric', { count: counts.media }) : t('galleryEmptyMetric'),
          icon: previews.galleryHasVideos ? 'film-outline' : 'images-outline',
          href: `${base}/gallery`,
          preview:
            previews.galleryImages.length > 0 ? (
              <View className="flex-row gap-1.5">
                {previews.galleryImages.slice(0, 4).map((uri) => (
                  <Image key={uri} source={{ uri }} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" accessibilityIgnoresInvertColors />
                ))}
              </View>
            ) : undefined,
        }
      case 'places':
        return {
          title: t('placesTitle'),
          description: t('placesDescription'),
          metric: counts.places > 0 ? t('placesMetric', { count: counts.places }) : t('placesEmptyMetric'),
          icon: 'map-outline',
          href: `${base}/places`,
          preview: previews.placesPins.length > 0 ? <Muted numberOfLines={1}>{previews.placesPins.map((pin) => pin.title).join(' · ')}</Muted> : undefined,
        }
      case 'tributes':
        return {
          title: t('tributesTitle'),
          description: t('tributesDescription'),
          metric: counts.tributes > 0 ? t('tributesMetric', { count: counts.tributes }) : t('tributesEmptyMetric'),
          icon: 'flower-outline',
          href: `${base}/tributes`,
          preview: <Faces people={previews.tributeAuthors} />,
        }
      case 'favorites':
        return {
          title: t('favoritesTitle'),
          description: t('favoritesDescription'),
          metric: counts.favorites > 0 ? t('favoritesMetric', { count: counts.favorites }) : t('favoritesEmptyMetric'),
          icon: 'heart-outline',
          href: `${base}/favorites`,
          preview: cards(previews.favorites),
        }
      case 'guardian':
        return {
          title: t('guardianTitle'),
          description: t('guardianDescription'),
          metric: counts.guarded > 0 ? t('guardianMetric', { count: counts.guarded }) : t('guardianEmptyMetric'),
          icon: 'shield-outline',
          href: `${base}/memorialized`,
          preview: cards(previews.memorials),
        }
      case 'pets':
      default:
        return {
          title: t('petsTitle'),
          description: t('petsDescription'),
          metric: counts.pets > 0 ? t('petsMetric', { count: counts.pets }) : t('petsEmptyMetric'),
          icon: 'paw-outline',
          href: `${base}/pets`,
          preview: cards(previews.pets),
        }
    }
  }
}

function SectionCard({ card, locked, onLocked }: { card: SectionCardData; locked: boolean; onLocked: () => void }) {
  const router = useRouter()
  const palette = usePalette('app')
  return (
    <Card onPress={locked ? onLocked : () => router.push(card.href)}>
      <Row className="items-start">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-default">
          <Icon name={card.icon} size={22} color={palette.dfg} />
        </View>
        <View className="flex-1">
          <Heading>{card.title}</Heading>
          <Muted>{card.description}</Muted>
        </View>
        <Icon name={locked ? 'lock-closed-outline' : 'chevron-forward'} size={18} color={palette.muted} />
      </Row>
      {card.preview}
      <RNText className="text-sm font-medium text-foreground">{card.metric}</RNText>
    </Card>
  )
}

function Sections({ data, onRequireAccount }: { data: ProfileView; onRequireAccount: () => void }) {
  const t = useT('Profile')
  const cardFor = useSectionCards(data)
  const geo = data.geo && (data.geo.lat !== 0 || data.geo.lon !== 0) ? data.geo : null
  return (
    <>
      {data.sections.map((section) => (
        <SectionCard key={section} card={cardFor(section)} locked={data.sectionsRequiringSignIn.includes(section)} onLocked={onRequireAccount} />
      ))}
      {data.profile.type === 'memorialized' ? (
        <SectionCard
          card={{
            title: t('geoTitle'),
            description: t('geoDescription'),
            metric: geo ? `${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}` : t('geoEmptyMetric'),
            icon: 'location-outline',
            href: `/profile/${data.profile.id}/geolocation`,
          }}
          locked={false}
          onLocked={onRequireAccount}
        />
      ) : null}
    </>
  )
}

/** Reports a plaque visit once per screen visit, like the web `QrScanTracker`. Fire-and-forget. */
function useQrScanBeacon(profileId: string, enabled: boolean) {
  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || sent.current === profileId) return
    sent.current = profileId
    http('app', appHttp.qrScan(), { method: 'POST', body: JSON.stringify({ profileId }) }).catch(() => undefined)
  }, [enabled, profileId])
}

/** The public profile: banner plus the module cards of its type (living, memorial or pet). */
export default function Profile() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const user = useAppUser()
  // Keyed by the viewer: flags and redaction depend on who is looking.
  const profile = useView('app', ['profile', id, user?.id ?? null], () => appApi.profile(id), { enabled: !!id })
  const { record } = useRecordRecentlyViewed()
  const [wall, setWall] = useState(false)
  const ta = useT('Auth')

  const data = profile.data
  useQrScanBeacon(id, !!data?.trackQrScan)

  const recorded = useRef<string | null>(null)
  useEffect(() => {
    if (!data || recorded.current === data.profile.id) return
    recorded.current = data.profile.id
    const p = data.profile
    void record({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      avatarUrl: p.avatarUrl,
      role: p.role,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      birthPlace: p.birthPlace,
      birthCountry: p.birthCountry,
      petSpecies: p.petSpecies,
      petBreed: p.petBreed,
    })
  }, [data, record])

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <Stack.Screen options={{ title: data ? fullName(data.profile) : '' }} />
      <QueryView query={profile}>
        {(view) => (
          <>
            <Banner data={view} onRequireAccount={() => setWall(true)} />
            {!view.viewer.isAuthenticated ? <SignUpPrompt callbackUrl={`/profile/${view.profile.id}`} /> : null}
            <Sections data={view} onRequireAccount={() => setWall(true)} />
          </>
        )}
      </QueryView>
      <Sheet visible={wall} onClose={() => setWall(false)} title={ta('signupWallTitle')}>
        <SignUpPrompt callbackUrl={`/profile/${id}`} onNavigate={() => setWall(false)} />
      </Sheet>
    </Screen>
  )
}
