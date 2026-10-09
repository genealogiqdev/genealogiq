"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { LucideIcon } from "lucide-react"
import { Network, BookOpenText, FileText, Images, Film, MapPin, BrickWall, QrCode, PawPrint } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { allowsExtraPurchase, type PlanQuotas, type PlanTier } from "@/lib/plan-quotas"
import { createExtraUnitCheckoutSession } from "@/actions/extra-units.actions"
import type { ExtraUnitResource } from "@/lib/extra-units"

export type LimitReachedContext =
  | "tree"
  | "bio"
  | "documents"
  | "media-images"
  | "media-videos"
  | "geoPlaces"
  | "memorials"
  | "pets"
  | "qrCode"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: LimitReachedContext
  limit: number
  tier: PlanTier
  memorialQr?: boolean
}

const CONTEXT_ICON: Record<LimitReachedContext, LucideIcon> = {
  tree: Network,
  bio: BookOpenText,
  documents: FileText,
  "media-images": Images,
  "media-videos": Film,
  geoPlaces: MapPin,
  memorials: BrickWall,
  pets: PawPrint,
  qrCode: QrCode,
}

// i18n keys are camelCase (matches every other namespace in messages/*.json)
// even though the context type itself uses "media-images"/"media-videos".
const CONTEXT_I18N_KEY: Record<LimitReachedContext, string> = {
  tree: "tree",
  bio: "bio",
  documents: "documents",
  "media-images": "mediaImages",
  "media-videos": "mediaVideos",
  geoPlaces: "geoPlaces",
  memorials: "memorials",
  pets: "pets",
  qrCode: "qrCode",
}

// Which PlanQuotas field governs each context — used to look up
// allowsExtraPurchase(field).
const CONTEXT_QUOTA_KEY: Record<LimitReachedContext, keyof PlanQuotas> = {
  tree: "treeMaxMembers",
  bio: "bioMaxChars",
  documents: "documentsMax",
  "media-images": "mediaMaxImages",
  "media-videos": "mediaMaxVideos",
  geoPlaces: "geoPlacesMax",
  memorials: "memorialsMax",
  pets: "petsMax",
  qrCode: "qrCodeMax",
}

// The 3 contexts with a real one-time purchase behind them (matches exactly
// the fields allowsExtraPurchase can return true for).
const CONTEXT_EXTRA_RESOURCE: Partial<Record<LimitReachedContext, ExtraUnitResource>> = {
  geoPlaces: "GEO_PLACE",
  qrCode: "QR_CODE",
  memorials: "MEMORIAL",
}

export function LimitReachedDialog({ open, onOpenChange, context, limit, tier, memorialQr = false }: Props) {
  const t = useTranslations("LimitReached")
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const Icon = CONTEXT_ICON[context]
  const i18nKey = CONTEXT_I18N_KEY[context]
  const allowsExtra = allowsExtraPurchase(CONTEXT_QUOTA_KEY[context], tier)
  const extraResource = CONTEXT_EXTRA_RESOURCE[context]

  // FREE always has a real higher tier to sell. Already-paying tiers (PREMIUM
  // today) only get the extra-purchase hint where the module
  // actually allows one; otherwise there's nothing further to offer beyond
  // acknowledging the limit — the CTA still points at /subscriptions (where
  // the current plan and its options are visible) rather than disappearing.
  const variant: "upgradeOrExtra" | "upgradeOnly" | "extraOnly" | "maxedOut" =
    tier === "FREE"
      ? allowsExtra ? "upgradeOrExtra" : "upgradeOnly"
      : allowsExtra ? "extraOnly" : "maxedOut"

  const ctaKey: "upgrade" | "extraOnly" | "maxedOut" =
    variant === "extraOnly" || variant === "maxedOut" ? variant : "upgrade"

  // Pets are blocked outright on FREE (petsMax=0) rather than merely capped —
  // "Your plan allows up to 0 pets" reads as broken, so swap in dedicated copy.
  const isPetsLocked = context === "pets" && tier === "FREE" && limit === 0

  // Only personal QR capacity is unchanged by an upgrade. Premium includes
  // the human memorial exports, so their upgrade explanation stays visible.
  const suffixKey = context === "qrCode" && !memorialQr && variant === "upgradeOrExtra" ? "qrUpgradeOrExtra" : variant

  const handleBuyExtra = () => {
    if (!extraResource) return
    startTransition(async () => {
      const result = await createExtraUnitCheckoutSession(extraResource, pathname)
      if (!result.ok) { toast.error(result.message); return }
      router.push(result.data!.url)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Icon className="text-primary" />
          </AlertDialogMedia>
          <AlertDialogTitle>{isPetsLocked ? t("title.petsLocked") : t(`title.${i18nKey}`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {isPetsLocked ? t("description.petsLocked") : t(`description.${i18nKey}`, { limit })}{" "}
            {t(`suffix.${suffixKey}`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("dismiss")}</AlertDialogCancel>
          {allowsExtra && extraResource && (
            <Button onClick={handleBuyExtra} disabled={isPending} variant={variant === "extraOnly" ? "default" : "outline"}>
              {isPending ? t("buying") : t("cta.buyExtra")}
            </Button>
          )}
          {variant !== "extraOnly" && (
            <AlertDialogAction asChild>
              <Link href="/subscriptions">{t(`cta.${ctaKey}`)}</Link>
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
