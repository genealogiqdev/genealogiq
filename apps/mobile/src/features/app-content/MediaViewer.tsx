import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import { FlatList, Modal, Pressable, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '@/i18n'
import { Icon, IconButton, Muted, Text } from '@/ui'
import { mediaUri } from './common'

export interface ViewerItem {
  key: string
  kind: 'image' | 'video'
  url: string
  poster?: string | null
  /** Main caption (description). */
  caption?: string | null
  /** Secondary line (date, place…). */
  detail?: string | null
}

const MAX_SCALE = 5

function ZoomableImage({ uri, width, height, label, onZoomChange }: { uri: string; width: number; height: number; label: string; onZoomChange: (zoomed: boolean) => void }) {
  const [zoomed, setZoomed] = useState(false)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const savedX = useSharedValue(0)
  const savedY = useSharedValue(0)

  const report = (next: boolean) => {
    setZoomed(next)
    onZoomChange(next)
  }

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * event.scale))
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1)
        x.value = withTiming(0)
        y.value = withTiming(0)
        savedScale.value = 1
        savedX.value = 0
        savedY.value = 0
        runOnJS(report)(false)
      } else {
        savedScale.value = scale.value
        runOnJS(report)(true)
      }
    })

  // Panning only while zoomed, so the horizontal swipe between items stays with the list.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      const limitX = (width * (scale.value - 1)) / 2
      const limitY = (height * (scale.value - 1)) / 2
      x.value = Math.min(limitX, Math.max(-limitX, savedX.value + event.translationX))
      y.value = Math.min(limitY, Math.max(-limitY, savedY.value + event.translationY))
    })
    .onEnd(() => {
      savedX.value = x.value
      savedY.value = y.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = scale.value <= 1.02
      scale.value = withTiming(zoomIn ? 2.5 : 1)
      savedScale.value = zoomIn ? 2.5 : 1
      x.value = withTiming(0)
      y.value = withTiming(0)
      savedX.value = 0
      savedY.value = 0
      runOnJS(report)(zoomIn)
    })

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }))

  return (
    <GestureDetector gesture={Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan))}>
      <Animated.View style={[{ width, height }, style]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" accessibilityLabel={label} transition={150} />
      </Animated.View>
    </GestureDetector>
  )
}

function VideoPlayerPage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false
    instance.play()
  })
  return <VideoView player={player} style={{ width, height }} nativeControls contentFit="contain" />
}

function VideoPage({ item, active, width, height, label }: { item: ViewerItem; active: boolean; width: number; height: number; label: string }) {
  // Only the visible page owns a player; neighbours show the poster.
  if (active) return <VideoPlayerPage uri={mediaUri(item.url)} width={width} height={height} />
  return (
    <View style={{ width, height }} className="items-center justify-center bg-default" accessibilityLabel={label}>
      {item.poster ? <Image source={{ uri: mediaUri(item.poster) }} style={{ width, height, position: 'absolute' }} contentFit="contain" /> : null}
      <Icon name="play-circle" size={64} />
    </View>
  )
}

/**
 * Full-screen viewer: swipe between items, pinch / double-tap to zoom images,
 * native playback controls for videos. `index === null` keeps it closed.
 */
export function MediaViewer({ items, index, onClose }: { items: ViewerItem[]; index: number | null; onClose: () => void }) {
  const t = useT('Gallery')
  const tm = useT('Mobile')
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [current, setCurrent] = useState(index ?? 0)
  const [zoomed, setZoomed] = useState(false)
  const list = useRef<FlatList<ViewerItem>>(null)

  useEffect(() => {
    if (index !== null) {
      setCurrent(index)
      setZoomed(false)
    }
  }, [index])

  if (index === null || items.length === 0) return null
  const shown = items[Math.min(current, items.length - 1)]

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width)
    setCurrent(Math.min(items.length - 1, Math.max(0, page)))
  }

  const go = (delta: number) => {
    const next = current + delta
    if (next < 0 || next >= items.length) return
    list.current?.scrollToIndex({ index: next, animated: true })
    setCurrent(next)
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent accessibilityLabel={t('viewerTitle')}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-background">
          <FlatList
            ref={list}
            data={items}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.key}
            initialScrollIndex={Math.min(index, items.length - 1)}
            getItemLayout={(_data, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
            onMomentumScrollEnd={onScrollEnd}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            renderItem={({ item, index: itemIndex }) => (
              <View style={{ width, height }} className="items-center justify-center">
                {item.kind === 'video' ? (
                  <VideoPage item={item} active={itemIndex === current} width={width} height={height * 0.7} label={t('videoThumbnailAlt')} />
                ) : (
                  <ZoomableImage uri={mediaUri(item.url)} width={width} height={height} label={item.caption ?? t('imageAlt')} onZoomChange={setZoomed} />
                )}
              </View>
            )}
          />

          <View className="absolute left-0 right-0 flex-row items-center justify-between px-3" style={{ top: insets.top + 4 }}>
            <View className="rounded-full bg-surface px-3 py-1">
              <Muted>{tm('appContent.itemOf', { index: current + 1, total: items.length })}</Muted>
            </View>
            <View className="rounded-full bg-surface">
              <IconButton icon="close" label={tm('common.close')} onPress={onClose} />
            </View>
          </View>

          {zoomed ? null : (
            <View className="absolute left-0 right-0 gap-2 px-4" style={{ bottom: insets.bottom + 12 }}>
              {shown.caption || shown.detail ? (
                <View className="gap-1 rounded-2xl bg-surface p-3">
                  {shown.caption ? <Text>{shown.caption}</Text> : null}
                  {shown.detail ? <Muted>{shown.detail}</Muted> : null}
                </View>
              ) : null}
              {items.length > 1 ? (
                <View className="flex-row justify-between">
                  <Pressable
                    onPress={() => go(-1)}
                    disabled={current === 0}
                    accessibilityRole="button"
                    accessibilityLabel={t('previous')}
                    className={`h-11 w-11 items-center justify-center rounded-full bg-surface ${current === 0 ? 'opacity-40' : ''}`}
                  >
                    <Icon name="chevron-back" />
                  </Pressable>
                  <Pressable
                    onPress={() => go(1)}
                    disabled={current >= items.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel={tm('appContent.next')}
                    className={`h-11 w-11 items-center justify-center rounded-full bg-surface ${current >= items.length - 1 ? 'opacity-40' : ''}`}
                  >
                    <Icon name="chevron-forward" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

/** Read-only photo strip that opens the viewer (biography, place, resting place). */
export function PhotoGrid({ photos, label, size = 112 }: { photos: string[]; label: (number: number) => string; size?: number }) {
  const [open, setOpen] = useState<number | null>(null)
  if (photos.length === 0) return null
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {photos.map((url, index) => (
          <Pressable key={`${url}-${index}`} onPress={() => setOpen(index)} accessibilityRole="imagebutton" accessibilityLabel={label(index + 1)} className="active:opacity-80">
            <Image source={{ uri: mediaUri(url) }} style={{ width: size, height: size, borderRadius: 12 }} contentFit="cover" transition={150} />
          </Pressable>
        ))}
      </View>
      <MediaViewer
        items={photos.map((url, index) => ({ key: `${url}-${index}`, kind: 'image' as const, url, caption: null }))}
        index={open}
        onClose={() => setOpen(null)}
      />
    </>
  )
}
