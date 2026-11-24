import { useCallback, useMemo, useRef } from 'react'
import { View } from 'react-native'
import MapView, { Callout, Marker } from 'react-native-maps'
import type { MapPin } from '@/api/app'
import { useT } from '@/i18n'
import { usePalette } from '@/theme'
import { Muted, Text } from '@/ui'
import type { PlacesMapViewProps } from './PlacesMapView'

const EDGE = { top: 80, right: 60, bottom: 80, left: 60 }

/** Full-screen map with one marker per place; a callout opens the place. */
export function PlacesMapView({ pins, onOpen }: PlacesMapViewProps) {
  const t = useT('Places')
  const tm = useT('Mobile.appContent')
  const palette = usePalette('app')
  const map = useRef<MapView>(null)
  const coordinates = useMemo(() => pins.map((pin: MapPin) => ({ latitude: pin.lat, longitude: pin.lon })), [pins])

  const fit = useCallback(() => {
    if (coordinates.length > 1) map.current?.fitToCoordinates(coordinates, { edgePadding: EDGE, animated: false })
  }, [coordinates])

  const first = coordinates[0]

  return (
    <MapView
      ref={map}
      style={{ flex: 1 }}
      initialRegion={first ? { ...first, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
      onMapReady={fit}
      onLayout={fit}
      toolbarEnabled={false}
    >
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          coordinate={{ latitude: pin.lat, longitude: pin.lon }}
          pinColor={palette.accent}
          title={pin.title}
          accessibilityLabel={pin.title}
        >
          <Callout onPress={() => onOpen(pin)} tooltip>
            <View className="gap-1 rounded-xl border border-border bg-surface p-3" style={{ maxWidth: 240 }}>
              <Text className="font-semibold">{pin.title}</Text>
              {pin.categories.length > 0 ? <Muted>{pin.categories.map((category) => t(`cat_${category}`)).join(', ')}</Muted> : null}
              <Muted className="text-link">{tm('openPlace')}</Muted>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  )
}
