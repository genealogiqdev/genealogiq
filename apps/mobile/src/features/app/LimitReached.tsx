import { usePathname, useRouter } from 'expo-router'
import { View } from 'react-native'
import { appApi, type ExtraUnitResource, type PlanTier } from '@/api/app'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { openInBrowser } from '@/lib/share'
import { Button, Icon, Sheet, Text, useAction, type IconName } from '@/ui'
import { useAppUser } from './session'

/** Same contexts as the web `LimitReachedDialog`. */
export type LimitReachedContext =
  | 'tree'
  | 'bio'
  | 'documents'
  | 'media-images'
  | 'media-videos'
  | 'geoPlaces'
  | 'memorials'
  | 'pets'
  | 'qrCode'

const ICONS: Record<LimitReachedContext, IconName> = {
  tree: 'git-network-outline',
  bio: 'book-outline',
  documents: 'document-text-outline',
  'media-images': 'images-outline',
  'media-videos': 'film-outline',
  geoPlaces: 'location-outline',
  memorials: 'flower-outline',
  pets: 'paw-outline',
  qrCode: 'qr-code-outline',
}

const KEYS: Record<LimitReachedContext, string> = {
  tree: 'tree',
  bio: 'bio',
  documents: 'documents',
  'media-images': 'mediaImages',
  'media-videos': 'mediaVideos',
  geoPlaces: 'geoPlaces',
  memorials: 'memorials',
  pets: 'pets',
  qrCode: 'qrCode',
}

/** The three limits with a one-time purchase behind them. */
const EXTRA_RESOURCE: Partial<Record<LimitReachedContext, ExtraUnitResource>> = {
  geoPlaces: 'GEO_PLACE',
  qrCode: 'QR_CODE',
  memorials: 'MEMORIAL',
}

/** Purchase policy of the web (`allowsExtraPurchase`), used until the account's own flags have loaded. */
function defaultPurchasable(resource: ExtraUnitResource, tier: PlanTier): boolean {
  return resource === 'MEMORIAL' ? tier !== 'FREE' : true
}

export interface LimitReachedSheetProps {
  visible: boolean
  onClose: () => void
  context: LimitReachedContext
  /** The plan limit that was hit. */
  limit: number
  /** The plan code of the account whose limit it is (`FREE`, `PREMIUM`…). */
  tier: PlanTier
  /** A memorial's QR export (included in Premium) rather than the personal QR allowance. */
  memorialQr?: boolean
  /** Web path Stripe returns to after an extra-unit purchase; defaults to the current screen. */
  returnPath?: string
}

/**
 * Explains a plan limit and offers the way past it: the plans screen and,
 * where the resource is sold individually, a one-unit checkout. Entitlement is
 * read back from the server after the browser closes.
 */
export function LimitReachedSheet({ visible, onClose, context, limit, tier, memorialQr = false, returnPath }: LimitReachedSheetProps) {
  const t = useT('LimitReached')
  const router = useRouter()
  const pathname = usePathname()
  const invalidate = useInvalidate('app')
  const signedIn = !!useAppUser()
  const { run, pending } = useAction()
  const me = useView('app', ['me'], appApi.me, { enabled: visible && signedIn })

  const resource = EXTRA_RESOURCE[context]
  const allowsExtra = resource ? (me.data?.extraUnits.purchasable[resource] ?? defaultPurchasable(resource, tier)) : false
  const variant = tier === 'FREE' ? (allowsExtra ? 'upgradeOrExtra' : 'upgradeOnly') : allowsExtra ? 'extraOnly' : 'maxedOut'
  const ctaKey = variant === 'extraOnly' || variant === 'maxedOut' ? variant : 'upgrade'
  // Pets are blocked outright on FREE rather than capped: "up to 0 pets" would read as broken.
  const petsLocked = context === 'pets' && tier === 'FREE' && limit === 0
  const suffixKey = context === 'qrCode' && !memorialQr && variant === 'upgradeOrExtra' ? 'qrUpgradeOrExtra' : variant
  const key = KEYS[context]

  async function buyExtra() {
    if (!resource) return
    const result = await run(() => appApi.createExtraUnitCheckoutSession(resource, returnPath ?? pathname))
    const url = result?.data?.url
    if (!url) return
    await openInBrowser(url)
    await invalidate()
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={petsLocked ? t('title.petsLocked') : t(`title.${key}`)}>
      <View className="flex-row items-start gap-3">
        <Icon name={ICONS[context]} size={28} />
        <Text className="flex-1">
          {petsLocked ? t('description.petsLocked') : t(`description.${key}`, { limit })} {t(`suffix.${suffixKey}`)}
        </Text>
      </View>
      {variant !== 'extraOnly' ? (
        <Button
          label={t(`cta.${ctaKey}`)}
          icon="sparkles-outline"
          onPress={() => {
            onClose()
            router.push('/subscriptions')
          }}
          fullWidth
        />
      ) : null}
      {allowsExtra && resource ? (
        <Button
          label={pending ? t('buying') : t('cta.buyExtra')}
          icon="cart-outline"
          variant={variant === 'extraOnly' ? 'primary' : 'secondary'}
          loading={pending}
          onPress={() => void buyExtra()}
          fullWidth
        />
      ) : null}
      <Button label={t('dismiss')} variant="ghost" onPress={onClose} fullWidth />
    </Sheet>
  )
}
