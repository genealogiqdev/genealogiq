'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@genealogiq/ui/button'
import { getCustomerMemorialQr } from '@/actions/memorial-qr.actions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@genealogiq/ui/dialog'
import { QrCodePresets } from './qr-code-presets'

interface Props {
  name: string
  customerId: string
  profileId: string
  access: 'allowed' | 'premiumRequired' | 'limitReached'
}

export function QrCodeDownloadDialog({ name, customerId, profileId, access }: Props) {
  const t = useTranslations('Memorialized')
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const filename = `qr-${name}`.toLowerCase().replace(/\s+/g, '-')

  const authorizeDownload = async () => {
    try {
      const result = await getCustomerMemorialQr(customerId, profileId)
      if (result.ok && result.data) return result.data.profileUrl
      setError(result.message ?? t('qr.generationFailed'))
    } catch {
      setError(t('qr.generationFailed'))
    }
    setProfileUrl(null)
    return null
  }

  const loadPreview = () => {
    setProfileUrl(null)
    setError(null)
    startTransition(async () => setProfileUrl(await authorizeDownload()))
  }

  if (access !== 'allowed') {
    return <span className="text-sm text-muted-foreground">{t(`qr.${access}`)}</span>
  }

  return (
    <Dialog onOpenChange={(open) => { if (open) loadPreview() }}>
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
        {isPending && <p role="status" className="text-sm text-muted-foreground">{t('qr.loading')}</p>}
        {error && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={loadPreview} disabled={isPending}>{t('qr.retry')}</Button>
          </div>
        )}
        {profileUrl && <QrCodePresets profileUrl={profileUrl} filename={filename} authorizeDownload={authorizeDownload} />}
      </DialogContent>
    </Dialog>
  )
}
