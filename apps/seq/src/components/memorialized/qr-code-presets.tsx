'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTranslations } from 'next-intl'
import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Card } from '@genealogiq/ui/card'

// Loose translator type so QrCard can receive the namespaced translator.
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

type Preset = {
  key: string
  fg:  string
  bg:  string
}

const PRESETS: Preset[] = [
  { key: 'classic',  fg: '#0F172A', bg: '#FFFFFF' },
  { key: 'indigo',   fg: '#454575', bg: '#FFFFFF' },
  { key: 'inverted', fg: '#FFFFFF', bg: '#0F172A' },
  { key: 'soft',     fg: '#7B90AB', bg: '#F5F1EA' },
  { key: 'bronze',   fg: '#7A5230', bg: '#F8F1E4' },
  { key: 'forest',   fg: '#1F4032', bg: '#FFFFFF' },
]

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

function QrCard({ preset, url, filename, t }: { preset: Preset; url: string; filename: string; t: Translator }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let active = true
    QRCode.toString(url, {
      type:                 'svg',
      errorCorrectionLevel: 'H',
      margin:               2,
      color:                { dark: preset.fg, light: preset.bg },
    }).then((s) => { if (active) setSvg(s) })
    return () => { active = false }
  }, [url, preset.fg, preset.bg])

  const handleSvg = () => {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filename}-${preset.key}.svg`)
    toast.success(t('qr.svgDownloaded'))
  }

  const handlePng = async () => {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      margin:               2,
      width:                1024,
      color:                { dark: preset.fg, light: preset.bg },
    })
    const res = await fetch(dataUrl)
    downloadBlob(await res.blob(), `${filename}-${preset.key}.png`)
    toast.success(t('qr.pngDownloaded'))
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div
        className="rounded-md overflow-hidden aspect-square p-4 flex items-center justify-center"
        style={{ background: preset.bg }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{t(`qr.presets.${preset.key}.name`)}</h3>
        <p className="text-xs text-muted-foreground leading-snug">{t(`qr.presets.${preset.key}.description`)}</p>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={handlePng} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-3.5 w-3.5" />PNG
        </Button>
        <Button onClick={handleSvg} disabled={!svg} variant="outline" size="sm" className="flex-1 gap-1.5">
          <Download className="h-3.5 w-3.5" />SVG
        </Button>
      </div>
    </Card>
  )
}

interface Props {
  profileUrl: string
  filename:   string
}

export function QrCodePresets({ profileUrl, filename }: Props) {
  const t = useTranslations('Memorialized')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(profileUrl)
    toast.success(t('qr.linkCopied'))
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
        {PRESETS.map((p) => (
          <QrCard key={p.key} preset={p} url={profileUrl} filename={filename} t={t} />
        ))}
      </div>
    </div>
  )
}
