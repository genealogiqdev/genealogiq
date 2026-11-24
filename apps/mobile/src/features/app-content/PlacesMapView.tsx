import { ScrollView, View } from 'react-native'
import type { MapPin } from '@/api/app'
import { useT } from '@/i18n'
import { ListRow, Muted } from '@/ui'
import { formatCoordinates } from './common'

export interface PlacesMapViewProps {
  pins: MapPin[]
  onOpen: (pin: MapPin) => void
}

/**
 * Web fallback: react-native-maps has no web support, so Metro resolves this
 * file on web and `PlacesMapView.native.tsx` (the real map) on iOS/Android.
 */
export function PlacesMapView({ pins, onOpen }: PlacesMapViewProps) {
  const t = useT('Places')
  const tm = useT('Mobile.appContent')
  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16 }}>
      <Muted>{tm('mapFallback')}</Muted>
      <View className="mt-2">
        {pins.map((pin) => (
          <ListRow
            key={pin.id}
            icon="location-outline"
            title={pin.title}
            subtitle={[formatCoordinates(pin.lat, pin.lon), pin.categories.map((category) => t(`cat_${category}`)).join(', ')].filter(Boolean).join(' · ')}
            onPress={() => onOpen(pin)}
          />
        ))}
      </View>
    </ScrollView>
  )
}
