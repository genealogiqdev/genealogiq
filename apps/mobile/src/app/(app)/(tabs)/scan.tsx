import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useIsFocused, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { GenCodeEntry } from '@/features/app/GenCodeEntry'
import { scannedLinkPath } from '@/features/app/scan-link'
import { useT } from '@/i18n'
import { Button, Card, Heading, Icon, LoadingState, Muted, Screen, Text, useNotify } from '@/ui'

/** How long a rejected or accepted code is ignored, so one glance does not fire repeatedly. */
const RESCAN_DELAY_MS = 2500

export default function Scan() {
  const t = useT('Qr')
  const ta = useT('Auth')
  const tm = useT('Mobile.app')
  const router = useRouter()
  const notify = useNotify()
  const focused = useIsFocused()
  const [permission, requestPermission] = useCameraPermissions()
  const [cameraFailed, setCameraFailed] = useState(false)
  const lockedUntil = useRef(0)

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const now = Date.now()
      if (now < lockedUntil.current) return
      lockedUntil.current = now + RESCAN_DELAY_MS
      const path = scannedLinkPath(result.data ?? '')
      if (!path) {
        notify.error(/^https?:\/\//i.test(result.data ?? '') ? t('scanner.notValidProfile') : t('scanner.invalidCode'))
        return
      }
      router.push(path)
    },
    [notify, router, t],
  )

  let camera
  if (!permission) {
    camera = <LoadingState />
  } else if (!permission.granted) {
    camera = (
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Icon name="camera-outline" size={40} />
        {permission.canAskAgain ? (
          <>
            <Text className="text-center">{tm('scan.permissionIntro')}</Text>
            <Button label={tm('scan.allowCamera')} icon="camera-outline" onPress={() => void requestPermission()} />
          </>
        ) : (
          <>
            <Heading className="text-center">{t('scanner.permissionDeniedTitle')}</Heading>
            <Muted className="text-center">{tm('scan.permissionDeniedHint')}</Muted>
            <Button label={tm('scan.openSettings')} variant="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} />
          </>
        )}
      </View>
    )
  } else if (cameraFailed) {
    camera = (
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Icon name="alert-circle-outline" size={40} />
        <Text className="text-center">{t('scanner.cameraStartFailed')}</Text>
        <Button label={tm('scan.retry')} variant="secondary" onPress={() => setCameraFailed(false)} />
      </View>
    )
  } else if (focused) {
    // Mounted only while the tab is on screen, so the camera is released elsewhere.
    camera = (
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
        onMountError={() => setCameraFailed(true)}
        accessibilityLabel={t('scanner.title')}
      />
    )
  } else {
    camera = null
  }

  return (
    <Screen>
      <View className="gap-1">
        <Heading>{t('scanner.title')}</Heading>
        <Muted>{t('scanner.pointCamera')}</Muted>
      </View>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface" style={{ aspectRatio: 1 }}>
        {camera}
      </View>
      <Card>
        <Heading>{ta('activateTitle')}</Heading>
        <Muted>{tm('scan.manualHint')}</Muted>
        <GenCodeEntry />
      </Card>
    </Screen>
  )
}
