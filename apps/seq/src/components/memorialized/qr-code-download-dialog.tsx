'use client'

import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@genealogiq/ui/dialog'
import { QrCodePresets } from './qr-code-presets'

export function QrCodeDownloadDialog({ name, profileUrl }: { name: string; profileUrl: string }) {
  const t = useTranslations('Memorialized')
  const filename = `qr-${name}`.toLowerCase().replace(/\s+/g, '-')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="text-sm font-medium text-primary hover:underline">
          {t('actions.download')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('table.qrCode')}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <QrCodePresets profileUrl={profileUrl} filename={filename} />
      </DialogContent>
    </Dialog>
  )
}
