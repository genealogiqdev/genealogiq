"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { QrCode, Lock } from "lucide-react"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"
import type { PlanTier } from "@/lib/plan-quotas"

interface Props {
  limit: number
  tier: PlanTier
  memorialQr?: boolean
}

// Replaces the old bespoke "Unlock your QR Code" card — the dialog now
// carries the explanation + upgrade CTA (opens automatically, since finding
// out the QR is locked IS the reason to visit this page); this stays behind
// it as a quiet placeholder plus a way to reopen the dialog after dismissing.
export function QrLockedCard({ limit, tier, memorialQr }: Props) {
  const t = useTranslations("Qr")
  const [open, setOpen] = useState(true)

  return (
    <>
      <div className="glass-card no-sheen flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
        <div className="relative">
          <QrCode className="h-10 w-10 text-muted-foreground" />
          <div className="absolute -bottom-1 -right-1 rounded-full bg-background/90 p-1 ring-1 ring-border/60">
            <Lock className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{t("profilePage.noQrYet")}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("profilePage.purchase")}
        </button>
      </div>

      <LimitReachedDialog open={open} onOpenChange={setOpen} context="qrCode" limit={limit} tier={tier} memorialQr={memorialQr} />
    </>
  )
}
