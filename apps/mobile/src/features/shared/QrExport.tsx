import { useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import QRCodeSvg from 'react-native-qrcode-svg'
import { useT } from '@/i18n'
import { QR_PNG_SIZE, QR_PRESETS, qrSvg, type QrPreset } from '@/lib/qr'
import { copyText, savePngToPhotos, shareFile } from '@/lib/share'
import { Button, Muted, Row, useNotify } from '@/ui'

type QrRef = { toDataURL: (callback: (data: string) => void) => void }

interface QrExportProps {
  /** The URL the code opens. */
  value: string
  /** Base file name for exports, without extension. */
  fileName: string
  /** Hide the export buttons (preview only). */
  previewOnly?: boolean
  /** Called before every export, e.g. to record that a code was issued. Return false to cancel. */
  beforeExport?: () => Promise<boolean>
}

/**
 * QR preview with the six print colour presets and PNG / SVG / copy-link
 * exports. Codes use error-correction level H and a four-module quiet zone,
 * the same settings as the web exports.
 */
export function QrExport({ value, fileName, previewOnly, beforeExport }: QrExportProps) {
  const t = useT('Mobile')
  const notify = useNotify()
  const [preset, setPreset] = useState<QrPreset>(QR_PRESETS[0])
  const [busy, setBusy] = useState<'png' | 'svg' | 'photos' | null>(null)
  const hidden = useRef<QrRef | null>(null)

  const png = () =>
    new Promise<string>((resolve, reject) => {
      if (!hidden.current) reject(new Error('qr not ready'))
      else hidden.current.toDataURL((data) => resolve(data.replace(/\s/g, '')))
    })

  async function guarded(kind: 'png' | 'svg' | 'photos', work: () => Promise<void>) {
    setBusy(kind)
    try {
      if (beforeExport && !(await beforeExport())) return
      await work()
    } catch (error) {
      notify.error(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <View className="gap-4">
      <View className="items-center">
        <View style={{ backgroundColor: preset.bg, padding: 16, borderRadius: 16 }}>
          <QRCodeSvg value={value} size={220} color={preset.fg} backgroundColor={preset.bg} ecl="H" />
        </View>
      </View>

      {/* Full-resolution copy used only to rasterise the PNG export. */}
      <View style={{ position: 'absolute', opacity: 0, left: -5000 }} pointerEvents="none">
        <QRCodeSvg
          value={value}
          size={QR_PNG_SIZE}
          quietZone={Math.round(QR_PNG_SIZE / 12)}
          color={preset.fg}
          backgroundColor={preset.bg}
          ecl="H"
          getRef={(ref) => {
            hidden.current = ref as unknown as QrRef
          }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
        {QR_PRESETS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setPreset(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.key === preset.key }}
            accessibilityLabel={option.key}
            className={`h-12 w-12 items-center justify-center rounded-xl border-2 ${option.key === preset.key ? 'border-accent' : 'border-border'}`}
            style={{ backgroundColor: option.bg }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: option.fg }} />
          </Pressable>
        ))}
      </ScrollView>

      <Muted className="text-center" numberOfLines={2} selectable>
        {value}
      </Muted>

      {previewOnly ? null : (
        <View className="gap-2">
          <Row>
            <View className="flex-1">
              <Button
                label="PNG"
                icon="image-outline"
                variant="secondary"
                loading={busy === 'png'}
                onPress={() => void guarded('png', async () => shareFile(`${fileName}.png`, await png(), { mimeType: 'image/png', encoding: 'base64' }))}
                fullWidth
              />
            </View>
            <View className="flex-1">
              <Button
                label="SVG"
                icon="code-slash-outline"
                variant="secondary"
                loading={busy === 'svg'}
                onPress={() => void guarded('svg', async () => shareFile(`${fileName}.svg`, qrSvg(value, preset), { mimeType: 'image/svg+xml' }))}
                fullWidth
              />
            </View>
          </Row>
          <Button
            label={t('qr.saveToPhotos')}
            icon="download-outline"
            variant="secondary"
            loading={busy === 'photos'}
            onPress={() =>
              void guarded('photos', async () => {
                const saved = await savePngToPhotos(`${fileName}.png`, await png())
                if (saved) notify.success(t('qr.savedToPhotos'))
                else notify.error(t('common.permissionDenied'))
              })
            }
            fullWidth
          />
          <Button
            label={t('qr.copyLink')}
            icon="copy-outline"
            variant="ghost"
            onPress={() => {
              void copyText(value).then(() => notify.success(t('common.copied')))
            }}
            fullWidth
          />
        </View>
      )}
    </View>
  )
}
