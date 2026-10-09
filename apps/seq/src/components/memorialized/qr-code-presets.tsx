'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTranslations } from 'next-intl'
import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Card } from '@genealogiq/ui/card'
import { QR_PRESETS, QR_OPTIONS, QR_PNG_WIDTH, type QrPreset } from './qr-code-presets.config'

// Loose translator type so QrCard can receive the namespaced translator.
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function QrCard({ preset, url, filename, t, authorizeDownload }: {
  preset: QrPreset; url: string; filename: string; t: Translator
  authorizeDownload?: () => Promise<string | null>
}) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let active = true
    QRCode.toString(url, {
      ...QR_OPTIONS,
      type:                 'svg',
      color:                { dark: preset.fg, light: preset.bg },
    }).then((s) => { if (active) setSvg(s) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [url, preset.fg, preset.bg, attempt])

  const handleDownload = async (format: 'png' | 'svg') => {
    if (!svg || downloading) return
    setDownloading(true)
    try {
      const currentUrl = authorizeDownload ? await authorizeDownload() : url
      if (!currentUrl) return
      const options = { ...QR_OPTIONS, color: { dark: preset.fg, light: preset.bg } }
      if (format === 'svg') {
        const currentSvg = await QRCode.toString(currentUrl, { ...options, type: 'svg' })
        downloadBlob(new Blob([currentSvg], { type: 'image/svg+xml' }), `${filename}-${preset.key}.svg`)
        toast.success(t('qr.svgDownloaded'))
      } else {
        const dataUrl = await QRCode.toDataURL(currentUrl, { ...options, width: QR_PNG_WIDTH })
        const res = await fetch(dataUrl)
        downloadBlob(await res.blob(), `${filename}-${preset.key}.png`)
        toast.success(t('qr.pngDownloaded'))
      }
    } catch {
      toast.error(t('qr.generationFailed'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div
        className="rounded-md overflow-hidden aspect-square p-4 flex items-center justify-center"
        style={{ background: preset.bg }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {failed && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{t('qr.generationFailed')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>{t('qr.retry')}</Button>
        </div>
      )}
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{t(`qr.presets.${preset.key}.name`)}</h3>
        <p className="text-xs text-muted-foreground leading-snug">{t(`qr.presets.${preset.key}.description`)}</p>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={() => handleDownload('png')} disabled={!svg || downloading} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-3.5 w-3.5" />PNG
        </Button>
        <Button onClick={() => handleDownload('svg')} disabled={!svg || downloading} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-3.5 w-3.5" />SVG
        </Button>
      </div>
    </Card>
  )
}

interface Props {
  profileUrl: string
  filename:   string
  // Inventory prints already belong to a scoped physical GenCode. Customer
  // memorial exports supply a live tenant/guardian/plan check via the dialog.
  authorizeDownload?: () => Promise<string | null>
}

export function QrCodePresets({ profileUrl, filename, authorizeDownload }: Props) {
  const t = useTranslations('Memorialized')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl)
      toast.success(t('qr.linkCopied'))
    } catch {
      toast.error(t('qr.copyFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60 truncate">
          {profileUrl}
        </code>
        <Button onClick={handleCopy} variant="ghost" size="sm" className="gap-1.5 shrink-0">
          <Copy className="h-3.5 w-3.5" />{t('qr.copyLink')}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QR_PRESETS.map((p) => (
          <QrCard key={`${p.key}:${profileUrl}`} preset={p} url={profileUrl} filename={filename} t={t} authorizeDownload={authorizeDownload} />
        ))}
      </div>
    </div>
  )
}
