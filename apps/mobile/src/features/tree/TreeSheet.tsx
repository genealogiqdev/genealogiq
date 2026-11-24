import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '@/i18n'
import { Heading, IconButton } from '@/ui'

interface TreeSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  /** Shows a back arrow in the header (multi-step sheets). */
  onBack?: () => void
  backLabel?: string
  /** Pinned under the scrolling content (primary action). */
  footer?: ReactNode
  children: ReactNode
}

/** The UI kit sheet, but scrollable and keyboard-aware so tree forms never hide their submit button. */
export function TreeSheet({ visible, onClose, title, onBack, backLabel, footer, children }: TreeSheetProps) {
  const insets = useSafeAreaInsets()
  const t = useT('Mobile.common')
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack ?? onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-backdrop" onPress={onClose} accessibilityLabel={t('close')} />
          <View className="max-h-[90%] rounded-t-3xl bg-overlay px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
            <View className="h-1 w-10 self-center rounded-full bg-separator" />
            <View className="flex-row items-center gap-1 py-2">
              {onBack ? <IconButton icon="arrow-back" label={backLabel ?? t('close')} onPress={onBack} /> : null}
              <Heading className="flex-1" numberOfLines={2}>
                {title ?? ''}
              </Heading>
              <IconButton icon="close" label={t('close')} onPress={onClose} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              <View className="gap-3 pb-3">{children}</View>
            </ScrollView>
            {footer ? <View className="gap-2 border-t border-border pt-3">{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
