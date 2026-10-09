"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { useTranslations } from "next-intl"
import { GenCodeDownloadButtons } from "@/components/gen-code-download-buttons"

interface Props {
  profileId: string
  placeId: string
  canDownload: boolean
}

function generateQr(target: string): Promise<string> {
  return QRCode.toDataURL(target, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 512,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })
}

// Renders the QR for a place whose code has already been generated and
// persisted (place.qrGenerated) — the PNG itself isn't stored, only the flag,
// so it's rebuilt client-side from the same deterministic target URL on every
// mount.
export function PlaceQrDisplay({ profileId, placeId, canDownload }: Props) {
  const t = useTranslations("Places")
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const target = `${window.location.origin}/profile/${profileId}/places/${placeId}`
    generateQr(target).then((png) => {
      if (active) setDataUrl(png)
    })
    return () => {
      active = false
    }
  }, [profileId, placeId])

  return (
    <div className="flex w-48 flex-col gap-3">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={t("qrTitle")} className="h-48 w-48 rounded-xl border border-border/60" />
      ) : (
        <div className="h-48 w-48 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
      )}
      {canDownload && (
        <GenCodeDownloadButtons target={{ kind: "place", profileId, placeId }} />
      )}
    </div>
  )
}
