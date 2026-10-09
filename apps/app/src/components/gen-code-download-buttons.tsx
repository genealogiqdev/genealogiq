"use client"

import { useTransition } from "react"
import { Download, LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { downloadPlaceQrCode } from "@/actions/place-qr.actions"
import { downloadPetQrCode } from "@/actions/pet-qr.actions"
import type { QrDownloadFormat } from "@/lib/qr-download"

type DownloadTarget =
  | { kind: "place"; profileId: string; placeId: string }
  | { kind: "pet"; profileId: string }

export function GenCodeDownloadButtons({ target }: { target: DownloadTarget }) {
  const t = useTranslations("Qr")
  const [isDownloading, startDownload] = useTransition()

  const handleDownload = (format: QrDownloadFormat) => {
    startDownload(async () => {
      try {
        const result = target.kind === "place"
          ? await downloadPlaceQrCode(target.profileId, target.placeId, format)
          : await downloadPetQrCode(target.profileId, format)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        if (!result.data) {
          toast.error(t("client.downloadFailed"))
          return
        }

        const id = target.kind === "place" ? target.placeId : target.profileId
        const link = document.createElement("a")
        link.href = result.data.dataUrl
        link.download = `gencode-${id}.${format}`
        document.body.appendChild(link)
        link.click()
        link.remove()
        toast.success(t(format === "svg" ? "client.svgDownloaded" : "client.pngDownloaded"))
      } catch {
        toast.error(t("client.downloadFailed"))
      }
    })
  }

  return (
    <div className="w-48 space-y-2">
      <p className="text-sm font-semibold">{t("client.downloadGenCode")}</p>
      <div className="flex gap-2" role="group" aria-label={t("client.downloadGenCode")} aria-busy={isDownloading}>
        {(["png", "svg"] as const).map((format) => (
          <Button
            key={format}
            type="button"
            className="h-11 flex-1 gap-2"
            disabled={isDownloading}
            aria-label={t("client.downloadFormat", { format: format.toUpperCase() })}
            onClick={() => handleDownload(format)}
          >
            {isDownloading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {format.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  )
}
