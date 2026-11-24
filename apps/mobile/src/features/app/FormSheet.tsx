import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '@/i18n'
import { Heading, IconButton } from '@/ui'

/**
 * A bottom sheet for forms: same look as the UI kit `Sheet`, but it rises with
 * the keyboard and scrolls, so the submit button is never hidden behind it.
 */
export function FormSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const t = useT('Mobile.common')
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-backdrop" onPress={onClose} accessibilityLabel={t('close')} />
          <View className="max-h-[88%] rounded-t-3xl bg-overlay px-4 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="h-1 w-10 self-center rounded-full bg-separator" />
            <View className="flex-row items-center justify-between py-2">
              <Heading className="flex-1">{title ?? ''}</Heading>
              <IconButton icon="close" label={t('close')} onPress={onClose} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="gap-3 pb-2">{children}</View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
