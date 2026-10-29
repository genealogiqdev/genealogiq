'use client'

import { useEffect, useState } from "react"
import { Copy, Download } from "lucide-react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { downloadBlob, downloadQrDataUrl } from "@/lib/download-file"

type Preset = {
  key: string
  fg: string
  bg: string
}

// Visual presets; display name + description are localized via the "presets" key.
const PRESETS: Preset[] = [
  { key: "classic",  fg: "#0F172A", bg: "#FFFFFF" },
  { key: "indigo",   fg: "#454575", bg: "#FFFFFF" },
  { key: "inverted", fg: "#FFFFFF", bg: "#0F172A" },
  { key: "soft",     fg: "#7B90AB", bg: "#F5F1EA" },
  { key: "bronze",   fg: "#7A5230", bg: "#F8F1E4" },
  { key: "forest",   fg: "#1F4032", bg: "#FFFFFF" },
]

function QrCard({ preset, url }: { preset: Preset; url: string }) {
  const t = useTranslations("Qr")
  const [svg, setSvg] = useState("")

  useEffect(() => {
    let active = true
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: preset.fg, light: preset.bg },
    }).then((s) => { if (active) setSvg(s) })
    return () => { active = false }
  }, [url, preset.fg, preset.bg])

  const handleSvg = () => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml" })
      downloadBlob(blob, `qr-${preset.key}.svg`)
      toast.success(t("client.svgDownloaded"))
    } catch {
      toast.error(t("client.downloadFailed"))
    }
  }

  const handlePng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 1024,
        color: { dark: preset.fg, light: preset.bg },
      })
      await downloadQrDataUrl(dataUrl, `qr-${preset.key}.png`)
      toast.success(t("client.pngDownloaded"))
    } catch {
      toast.error(t("client.downloadFailed"))
    }
  }

  return (
    <Card className="glass-card no-sheen p-5 flex flex-col gap-4">
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center aspect-square p-6"
        style={{ background: preset.bg }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="space-y-1">
        <h3 className="font-semibold">{t(`presets.${preset.key}.name`)}</h3>
        <p className="text-sm text-muted-foreground">{t(`presets.${preset.key}.description`)}</p>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={handlePng} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-4 w-4" />PNG
        </Button>
        <Button onClick={handleSvg} disabled={!svg} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-4 w-4" />SVG
        </Button>
      </div>
    </Card>
  )
}

interface Props {
  profileUrl: string
}

export function QrCodeClient({ profileUrl }: Props) {
  const t = useTranslations("Qr")
  const handleCopy = async () => {
    await navigator.clipboard.writeText(profileUrl)
    toast.success(t("client.linkCopied"))
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-2 animate-fade-in">
        <code className="text-xs md:text-sm px-3 py-1.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60 truncate max-w-[60ch]">
          {profileUrl}
        </code>
        <Button onClick={handleCopy} variant="ghost" size="sm" className="gap-2">
          <Copy className="h-4 w-4" />{t("client.copyLink")}
        </Button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{t("client.downloadHint")}</p>
      <div className={cn("grid gap-5", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")} style={{ animationDelay: "80ms" }}>
        {PRESETS.map((p) => (
          <QrCard key={p.key} preset={p} url={profileUrl} />
        ))}
      </div>
    </>
  )
}
