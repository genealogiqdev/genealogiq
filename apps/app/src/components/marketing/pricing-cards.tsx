"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface MarketingPlan {
  code: string
  currency: string
  id: string
  monthlyPrice: number | null
  name: string
  price: number
  quotas: {
    bioMaxChars: number
    documentsMax: number
    geoPlacesMax: number
    mediaMaxImages: number
    mediaMaxVideos: number
    memorialsMax: number
    petsMax: number
    qrCodeMax: number
    treeMaxMembers: number
  }
  termLength: number
}

interface PricingCardsProps {
  plans: MarketingPlan[]
}

export function PricingCards({ plans }: PricingCardsProps) {
  const t = useTranslations("Marketing")
  const tSubscriptions = useTranslations("Subscriptions")
  const locale = useLocale()
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual")

  return (
    <div>
      <div className="mx-auto mb-8 flex w-fit rounded-full border border-white/10 bg-white/[0.055] p-1" role="group" aria-label={t("plans.cadenceLabel")}>
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCadence(value)}
            aria-pressed={cadence === value}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300",
              cadence === value ? "bg-white text-[#11121c] shadow-lg" : "text-white/50 hover:text-white",
            )}
          >
            {t(`plans.${value}`)}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {plans.map((plan) => {
          const isFree = plan.code === "FREE"
          const monthly = plan.monthlyPrice ?? (plan.termLength > 0 ? plan.price / plan.termLength : plan.price)
          const amount = cadence === "monthly" ? monthly : plan.price
          const saving = !isFree && monthly > 0
            ? Math.max(0, Math.round((1 - plan.price / (monthly * Math.max(plan.termLength, 12))) * 100))
            : 0
          const formatter = new Intl.NumberFormat(locale, {
            style: "currency",
            currency: plan.currency,
            maximumFractionDigits: 2,
          })
          const features = [
            tSubscriptions("features.treeMembers", { count: plan.quotas.treeMaxMembers }),
            tSubscriptions("features.mediaImages", { count: plan.quotas.mediaMaxImages }),
            tSubscriptions("features.documents", { count: plan.quotas.documentsMax }),
            tSubscriptions("features.geoPlaces", { count: plan.quotas.geoPlacesMax }),
            tSubscriptions("features.memorials", { count: plan.quotas.memorialsMax }),
            tSubscriptions("features.qrCodeCount", { count: plan.quotas.qrCodeMax }),
          ]

          return (
            <article
              key={plan.id}
              className={cn(
                "marketing-plan-card relative flex flex-col overflow-hidden rounded-[2rem] border p-6 sm:p-8",
                isFree
                  ? "border-white/10 bg-white/[0.045]"
                  : "border-violet-300/30 bg-[linear-gradient(145deg,rgba(139,128,246,0.17),rgba(255,255,255,0.045)_50%)] shadow-[0_28px_90px_rgba(38,24,100,0.3)]",
              )}
            >
              {!isFree && (
                <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />
              )}

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{t(isFree ? "plans.start" : "plans.grow")}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{plan.name}</h3>
                </div>
                {!isFree && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-950">
                    <Sparkles className="h-3 w-3" />
                    {t("plans.recommended")}
                  </span>
                )}
              </div>

              <div className="relative mt-8 min-h-16">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {isFree ? t("plans.free") : formatter.format(amount)}
                  </span>
                  {!isFree && (
                    <span className="pb-1 text-sm text-white/40">
                      {t(cadence === "annual" ? "plans.perYear" : "plans.perMonth")}
                    </span>
                  )}
                </div>
                {!isFree && cadence === "annual" && saving > 0 && (
                  <p className="mt-2 text-xs font-medium text-emerald-300">{t("plans.save", { percent: saving })}</p>
                )}
              </div>

              <ul className="relative mt-8 flex-1 space-y-3 border-t border-white/8 pt-7">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed text-white/60">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={isFree ? "outline" : "default"}
                size="lg"
                className={cn(
                  "relative mt-8 w-full rounded-full",
                  isFree && "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                )}
              >
                <Link href={isFree ? "/sign-up" : "/sign-up?callbackUrl=%2Fsubscriptions"}>
                  {t(isFree ? "plans.freeCta" : "plans.premiumCta")}
                </Link>
              </Button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
