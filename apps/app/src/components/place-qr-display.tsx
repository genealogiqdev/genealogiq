"use client"

import { useEffect, useState, useTransition } from "react"
import QRCode from "qrcode"
import { useTranslations } from "next-intl"
import { Download, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { downloadPlaceQrCode } from "@/actions/place-qr.actions"

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
  const [isDownloading, startDownload] = useTransition()

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

  const handleDownload = () => {
    startDownload(async () => {
      try {
        const result = await downloadPlaceQrCode(profileId, placeId)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        if (!result.data) {
          toast.error(t("qrDownloadFailed"))
          return
        }

        const link = document.createElement("a")
        link.href = result.data.dataUrl
        link.download = `gencode-${placeId}.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
        toast.success(t("qrPngDownloaded"))
      } catch {
        toast.error(t("qrDownloadFailed"))
      }
    })
  }

  return (
    <div className="flex w-48 flex-col gap-3">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={t("qrTitle")} className="h-48 w-48 rounded-xl border border-border/60" />
      ) : (
        <div className="h-48 w-48 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
      )}
      {canDownload && (
        <Button
          type="button"
          className="h-11 w-full gap-2"
          disabled={isDownloading}
          aria-busy={isDownloading}
          onClick={handleDownload}
        >
          {isDownloading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {t(isDownloading ? "qrDownloading" : "qrDownload")}
        </Button>
      )}
    </div>
  )
}
