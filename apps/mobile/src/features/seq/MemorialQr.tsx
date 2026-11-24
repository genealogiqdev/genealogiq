import { useState } from 'react'
import { ScrollView } from 'react-native'
import { seqApi, type QrAccess } from '@/api/seq'
import { QrExport } from '@/features/shared/QrExport'
import { useT } from '@/i18n'
import { useInvalidate } from '@/lib/query'
import { Button, Muted, Sheet } from '@/ui'
import { Notice } from './forms'

interface MemorialQrProps {
  name: string
  customerId: string
  profileId: string
  access: QrAccess
}

/**
 * The memorial QR dialog (web: QrCodeDownloadDialog).
 *
 * `getCustomerMemorialQr` is not a read: the first call for a memorial consumes
 * one GenCode and its credit. It therefore runs only when the user presses the
 * button inside the sheet (after reading the inventory notice) and again before
 * each export, exactly as the web re-authorises every download. It is never
 * prefetched, polled or retried automatically.
 */
export function MemorialQr({ name, customerId, profileId, access }: MemorialQrProps) {
  const t = useT('Memorialized')
  const tm = useT('Mobile.seq.memorialQr')
  const invalidate = useInvalidate('seq')
  const [open, setOpen] = useState(false)
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const fileName = `qr-${name}`.toLowerCase().replace(/\s+/g, '-')

  async function authorize(): Promise<string | null> {
    try {
      const result = await seqApi.getCustomerMemorialQr(customerId, profileId)
      if (result.ok && result.data) return result.data.profileUrl
      setError((!result.ok && result.message) || t('qr.generationFailed'))
    } catch {
      setError(t('qr.generationFailed'))
    }
    setProfileUrl(null)
    return null
  }

  async function generate() {
    if (pending) return
    setError(null)
    setPending(true)
    const url = await authorize()
    setProfileUrl(url)
    setPending(false)
    // A first issue binds a GenCode: stock, the memorial's QR status and the customer change.
    if (url) void invalidate(['memorial', profileId], ['customer', customerId], ['activations'], ['dashboard'])
  }

  function close() {
    if (pending) return
    setOpen(false)
    setProfileUrl(null)
    setError(null)
  }

  if (access !== 'allowed') return <Muted>{t(`qr.${access}`)}</Muted>

  return (
    <>
      <Button label={t('table.qrCode')} icon="qr-code-outline" variant="secondary" size="sm" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={close} title={`${t('table.qrCode')} · ${name}`}>
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          <Notice>{t('qr.inventoryNotice')}</Notice>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {profileUrl ? (
            <QrExport
              value={profileUrl}
              fileName={fileName}
              beforeExport={async () => {
                setError(null)
                return (await authorize()) !== null
              }}
            />
          ) : (
            <Button
              label={pending ? t('qr.loading') : error ? t('qr.retry') : tm('generate')}
              icon="qr-code-outline"
              onPress={() => void generate()}
              loading={pending}
              fullWidth
            />
          )}
        </ScrollView>
      </Sheet>
    </>
  )
}
