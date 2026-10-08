"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Check } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { changeSubscription, createCheckoutSession } from "@/actions/billing.actions"
import { allowsExtraPurchase } from "@/lib/plan-quotas"
import { cn } from "@/lib/utils"
import type { Currency } from "@/lib/currency"
import type { SubscriptionRow } from "@/queries/subscriptions"
import type { ActivePlan } from "@/queries/billing"

const longDate = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

interface Props {
  subscriptions: SubscriptionRow[]
  activePlan:    ActivePlan | null
  flashStatus?:  "success" | "cancel" | null
}

type PendingChange = {
  plan:    SubscriptionRow
  cadence: "annual" | "monthly"
  effect:  "upgrade" | "downgrade"
}

function monthlyEquivalent(plan: { price: number; termLength: number; monthlyPrice?: number | null }) {
  if (plan.monthlyPrice != null) return plan.monthlyPrice
  return plan.termLength > 0 ? plan.price / plan.termLength : 0
}

function compareMonthly(
  a: { price: number; termLength: number; monthlyPrice?: number | null },
  b: { price: number; termLength: number; monthlyPrice?: number | null },
) {
  return monthlyEquivalent(a) - monthlyEquivalent(b)
}

export function SubscriptionsGrid({ subscriptions, activePlan, flashStatus }: Props) {
  const t = useTranslations("Subscriptions")
  const router = useRouter()
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)

  useEffect(() => {
    if (flashStatus === "success") {
      toast.success(t("toasts.paymentReceived"))
    } else if (flashStatus === "cancel") {
      toast.info(t("toasts.checkoutCanceled"))
    }
  }, [flashStatus, t])

  // The page already mirrors the Checkout Session synchronously before this
  // component ever renders (see applyCheckoutSessionSync in page.tsx), so
  // activePlan is correct on first paint for the common case. The one gap
  // left is a delayed payment method (boleto/OXXO) still pending at redirect
  // time — a single delayed refresh (not a repeating interval, which was
  // re-triggering the toast effect above on every tick) gives the webhook a
  // little more time to land without hammering the route.
  useEffect(() => {
    if (flashStatus !== "success" || activePlan) return
    const timer = setTimeout(() => router.refresh(), 5000)
    return () => clearTimeout(timer)
  }, [flashStatus, activePlan, router])

  const activeSubscriptionId = activePlan?.subscription.id ?? null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {subscriptions.map((s, i) => {
          const isActive = activeSubscriptionId
            ? activeSubscriptionId === s.id
            : s.code === "FREE"
          return (
            <PlanCard
              key={s.id}
              plan={s}
              delay={i * 60}
              isActive={isActive}
              activePlan={activePlan}
              onRequestChange={setPendingChange}
            />
          )
        })}
      </div>

      <ChangeConfirmDialog
        pending={pendingChange}
        activePlan={activePlan}
        onClose={() => setPendingChange(null)}
      />
    </div>
  )
}

interface PlanCardProps {
  plan:            SubscriptionRow
  delay:           number
  isActive:        boolean
  activePlan:      ActivePlan | null
  onRequestChange: (change: PendingChange) => void
}

function PlanCard({ plan, delay, isActive, activePlan, onRequestChange }: PlanCardProps) {
  const router = useRouter()
  const t = useTranslations("Subscriptions")
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const isFree = plan.code === "FREE"
  const [selectedCadence, setSelectedCadence] = useState<"annual" | "monthly">("annual")

  const annualPrice = Number(plan.price)
  const monthlyPrice = monthlyEquivalent(plan)

  // Active plan shows what the user is actually paying (real currency +
  // cadence, from the stored AppSale), never the local toggle/current locale.
  const activeCadence = (activePlan?.cadence as "annual" | "monthly" | null) ?? "annual"
  const displayCadence = isActive ? activeCadence : selectedCadence
  const displayPrice = displayCadence === "annual" ? annualPrice : monthlyPrice
  const displayCurrency: Currency = isActive ? (activePlan?.currency ?? plan.currency) : plan.currency
  const format = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: displayCurrency }).format(amount)

  const startFirstSubscription = (cadence: "annual" | "monthly") => {
    startTransition(async () => {
      const result = await createCheckoutSession(plan.id, cadence)
      if (!result.ok) { toast.error(result.message); return }
      router.push(result.data!.url)
    })
  }

  const requestChange = (cadence: "annual" | "monthly") => {
    if (!activePlan) {
      startFirstSubscription(cadence)
      return
    }
    const cmp = compareMonthly(plan, activePlan.subscription)
    const effect: "upgrade" | "downgrade" = cmp >= 0 ? "upgrade" : "downgrade"
    onRequestChange({ plan, cadence, effect })
  }

  const termSuffix = displayCadence === "annual"
    ? (plan.termLength === 12 ? t("term.perYear") : plan.termLength === 0 ? t("term.perLifetime") : t("term.perMonths", { count: plan.termLength }))
    : t("term.perMonth")

  // Tabs/badge/button reserve the same row height on every card, real or
  // not — FREE always renders them invisible, and so does an active paid
  // card (which hides its own tabs/button) — so both cards line up
  // regardless of which plan the viewer is currently on.
  const showTabsAndButton = !isFree && !isActive && !activePlan?.couponRedemption && !activePlan?.consumerAccessGrant
  const showBestValue = !isFree && displayCadence === "annual" && !activePlan?.consumerAccessGrant

  const q = plan.quotas
  const featureRows: { key: string; text: string | null }[] = [
    { key: "tree", text: t("features.treeMembers", { count: q.treeMaxMembers }) },
    { key: "bio", text: t("features.bioChars", { count: q.bioMaxChars }) },
    { key: "documents", text: t("features.documents", { count: q.documentsMax }) },
    { key: "mediaImages", text: t("features.mediaImages", { count: q.mediaMaxImages }) },
    { key: "mediaVideos", text: t("features.mediaVideos", { count: q.mediaMaxVideos }) },
    { key: "geoPlaces", text: t("features.geoPlaces", { count: q.geoPlacesMax }) },
    { key: "geoPlacesExtra", text: allowsExtraPurchase("geoPlacesMax") ? t(isFree ? "features.geoPlacesExtra" : "features.geoPlacesExtraCheaper") : null },
    { key: "memorials", text: t("features.memorials", { count: q.memorialsMax }) },
    { key: "qrCode", text: t("features.qrCodeCount", { count: q.qrCodeMax }) },
    { key: "qrExtra", text: allowsExtraPurchase("qrCodeMax") ? t(isFree ? "features.qrExtra" : "features.qrExtraCheaper") : null },
    { key: "pets", text: q.petsMax > 0 ? t("features.petsCount", { count: q.petsMax }) : null },
  ]

  return (
    <div className="glass-card no-sheen p-6 flex flex-col gap-5 animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-semibold tracking-tight">{plan.name}</h3>
        {isActive && (
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full bg-primary text-primary-foreground px-2 py-0.5">
            {t("activeBadge")}
          </span>
        )}
      </div>

      <div className={cn(!showTabsAndButton && "invisible")}>
        <Tabs value={selectedCadence} onValueChange={(v) => setSelectedCadence(v as "annual" | "monthly")}>
          <TabsList className="w-full">
            <TabsTrigger value="monthly" className="flex-1">{t("tabs.monthly")}</TabsTrigger>
            <TabsTrigger value="annual" className="flex-1">{t("tabs.yearly")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-1.5">
        {isActive && activePlan?.consumerAccessGrant ? (
          <p className="text-lg font-semibold">{t('giftPrice')}</p>
        ) : isActive && activePlan?.couponRedemption ? (
          <p className="text-lg font-semibold">{t('manualPrice', { code: activePlan.couponRedemption.code })}</p>
        ) : (
        <div className="flex items-baseline gap-1">
          {!isFree && <span className="text-sm text-muted-foreground">{t("onlyPrefix")}</span>}
          <span className="text-4xl font-bold">{isFree ? t("freePrice") : format(displayPrice)}</span>
          {!isFree && <span className="text-sm text-muted-foreground">{termSuffix}</span>}
        </div>
        )}
        <span
          className={cn(
            "inline-block text-[10px] font-semibold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300",
            !showBestValue && "invisible",
          )}
        >
          {t("bestValue")}
        </span>
      </div>

      <ul className="space-y-2 flex-1">
        {featureRows.map((row) => (
          <li key={row.key} className={cn("flex items-start gap-2 text-sm", row.text === null && "invisible")}>
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{row.text ?? " "}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => requestChange(selectedCadence)}
        disabled={isPending || !showTabsAndButton}
        aria-hidden={!showTabsAndButton}
        tabIndex={showTabsAndButton ? undefined : -1}
        className={cn("w-full", !showTabsAndButton && "invisible")}
      >
        {isFree ? " " : `${format(displayPrice)} ${termSuffix}`}
      </Button>
    </div>
  )
}

interface ChangeConfirmDialogProps {
  pending:    PendingChange | null
  activePlan: ActivePlan | null
  onClose:    () => void
}

function ChangeConfirmDialog({ pending, activePlan, onClose }: ChangeConfirmDialogProps) {
  const router = useRouter()
  const t = useTranslations("Subscriptions")
  const tc = useTranslations("Common")
  const [isPending, startTransition] = useTransition()

  if (!pending || !activePlan) return null

  const isUpgrade = pending.effect === "upgrade"
  const cadenceLabel = pending.cadence === "annual" ? t("cadence.annual") : t("cadence.monthly")
  const periodEnd = longDate.format(activePlan.currentPeriodEnd)

  const title = isUpgrade ? t("confirm.upgradeTitle") : t("confirm.downgradeTitle")
  const description = isUpgrade
    ? t("confirm.upgradeDescription", { plan: pending.plan.name, cadence: cadenceLabel })
    : t("confirm.downgradeDescription", { currentPlan: activePlan.subscription.name, periodEnd, plan: pending.plan.name, cadence: cadenceLabel })
  const confirmLabel = isUpgrade ? t("confirm.upgradeAction") : t("confirm.downgradeAction")

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await changeSubscription(pending.plan.id, pending.cadence)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(
        result.data!.effect === "upgraded"
          ? t("toasts.switched", { plan: pending.plan.name })
          : t("toasts.scheduled", { plan: pending.plan.name, periodEnd }),
      )
      onClose()
      router.refresh()
    })
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? t("confirm.working") : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
