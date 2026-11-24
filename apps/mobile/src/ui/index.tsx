/**
 * Shared UI kit. Every screen builds from these so the three systems stay
 * consistent; brand differences come only from the active theme.
 * Built on HeroUI Native + Uniwind (Tailwind class names on React Native).
 */
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import type { UseQueryResult } from '@tanstack/react-query'
import { Image } from 'expo-image'
import {
  Button as HeroButton,
  Card as HeroCard,
  Chip as HeroChip,
  Description,
  FieldError,
  Input,
  Label,
  Spinner,
  Switch as HeroSwitch,
  TextField,
  useToast,
} from 'heroui-native'
import type { ComponentProps, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, type ActionResponse } from '@/api/client'
import { useCurrentSystem, useErrorMessage, useT } from '@/i18n'
import { formatDate, initials, toDateInput } from '@/lib/format'
import { headingFont, usePalette } from '@/theme'

export type IconName = ComponentProps<typeof Ionicons>['name']

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/* -------------------------------- Keyboard -------------------------------- */

/**
 * A scroll view that keeps the focused field above the keyboard, using only
 * React Native built-ins so it also runs in Expo Go. iOS insets the content
 * automatically; Android resizes the window (softwareKeyboardLayoutMode).
 */
export function KeyboardScrollView(props: ComponentProps<typeof ScrollView>) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      {...props}
    />
  )
}

/* ------------------------------- Typography ------------------------------- */

export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText {...props} className={cx('text-base text-foreground font-normal', className)} />
}

export function Muted({ className, ...props }: TextProps & { className?: string }) {
  return <RNText {...props} className={cx('text-sm text-muted font-normal', className)} />
}

export function Title({ className, style, ...props }: TextProps & { className?: string }) {
  const system = useCurrentSystem()
  return (
    <RNText
      {...props}
      style={[{ fontFamily: headingFont(system) }, style]}
      className={cx('text-2xl text-foreground', className)}
    />
  )
}

export function Heading({ className, style, ...props }: TextProps & { className?: string }) {
  const system = useCurrentSystem()
  return (
    <RNText
      {...props}
      style={[{ fontFamily: headingFont(system) }, style]}
      className={cx('text-lg text-foreground', className)}
    />
  )
}

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const palette = usePalette(useCurrentSystem())
  return <Ionicons name={name} size={size} color={color ?? palette.fg} />
}

/* --------------------------------- Layout --------------------------------- */

interface ScreenProps {
  children: ReactNode
  /** Disable the built-in scroll view (for screens that own a list or canvas). */
  scroll?: boolean
  padded?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  /** Pinned below the content, above the home indicator. */
  footer?: ReactNode
  className?: string
}

export function Screen({ children, scroll = true, padded = true, refreshing, onRefresh, footer, className }: ScreenProps) {
  const insets = useSafeAreaInsets()
  const palette = usePalette(useCurrentSystem())
  const body = scroll ? (
    <KeyboardScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: footer ? 16 : insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.accent} /> : undefined
      }
    >
      <View className={cx('gap-4', className)}>{children}</View>
    </KeyboardScrollView>
  ) : (
    <View className={cx('flex-1', padded && 'p-4', className)}>{children}</View>
  )
  return (
    <View className="flex-1 bg-background">
      {body}
      {footer ? (
        <View className="border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          {footer}
        </View>
      ) : null}
    </View>
  )
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cx('flex-row items-center gap-3', className)}>{children}</View>
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-2">
      {title || action ? (
        <View className="flex-row items-center justify-between">
          {title ? <Heading>{title}</Heading> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export function Card({ children, onPress, className }: { children: ReactNode; onPress?: () => void; className?: string }) {
  const card = (
    <HeroCard className={cx('rounded-2xl border border-border bg-surface p-4', className)}>
      <View className="gap-2">{children}</View>
    </HeroCard>
  )
  if (!onPress) return card
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-80">
      {card}
    </Pressable>
  )
}

export function Divider() {
  return <View className="h-px bg-border" />
}

/* --------------------------------- Actions -------------------------------- */

interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'danger-soft'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  className?: string
}

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, loading, disabled, fullWidth, className }: ButtonProps) {
  const palette = usePalette(useCurrentSystem())
  const onAccent = variant === 'primary' ? palette.afg : variant === 'danger' ? '#FFFFFF' : variant === 'danger-soft' ? palette.danger : palette.fg
  return (
    <HeroButton
      variant={variant}
      size={size}
      onPress={onPress}
      isDisabled={disabled || loading}
      accessibilityLabel={label}
      className={cx(fullWidth && 'w-full', className)}
    >
      {loading ? <Spinner size="sm" color={onAccent} /> : icon ? <Ionicons name={icon} size={18} color={onAccent} /> : null}
      <HeroButton.Label>{label}</HeroButton.Label>
    </HeroButton>
  )
}

export function IconButton({ icon, onPress, label, color, size = 22 }: { icon: IconName; onPress?: () => void; label: string; color?: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-default"
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  )
}

export function LinkText({ label, onPress, className }: { label: string; onPress?: () => void; className?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      <RNText className={cx('text-sm font-medium text-link', className)}>{label}</RNText>
    </Pressable>
  )
}

/* ---------------------------------- Forms --------------------------------- */

interface FieldProps extends Omit<TextInputProps, 'onChange'> {
  label?: string
  error?: string | null
  hint?: string
  required?: boolean
  disabled?: boolean
  right?: ReactNode
}

export function Field({ label, error, hint, required, disabled, right, multiline, className, ...input }: FieldProps & { className?: string }) {
  return (
    <TextField isInvalid={!!error} isRequired={required} isDisabled={disabled}>
      {label ? <Label>{label}</Label> : null}
      <View className="justify-center">
        <Input
          {...input}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : undefined}
          className={cx(multiline && 'min-h-28 py-3', right ? 'pr-12' : null, className)}
        />
        {right ? <View className="absolute right-2">{right}</View> : null}
      </View>
      {hint && !error ? <Description>{hint}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  )
}

export function PasswordField(props: FieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <Field
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <IconButton
          icon={visible ? 'eye-off-outline' : 'eye-outline'}
          label={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((value) => !value)}
          size={20}
        />
      }
    />
  )
}

export interface Option<V extends string = string> {
  value: V
  label: string
  description?: string
}

interface SelectFieldProps<V extends string> {
  label?: string
  value: V | null | undefined
  options: readonly Option<V>[]
  onChange: (value: V) => void
  placeholder?: string
  error?: string | null
  searchable?: boolean
  disabled?: boolean
  /** Adds a first row that clears the selection. */
  clearLabel?: string
  onClear?: () => void
}

export function SelectField<V extends string>({ label, value, options, onChange, placeholder, error, searchable, disabled, clearLabel, onClear }: SelectFieldProps<V>) {
  const t = useT('Mobile.common')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const selected = options.find((option) => option.value === value)
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options
  }, [filter, options])
  return (
    <View className="gap-1.5">
      {label ? <RNText className="text-sm font-medium text-foreground">{label}</RNText> : null}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        className={cx(
          'min-h-12 flex-row items-center justify-between rounded-xl border bg-field px-3',
          error ? 'border-danger' : 'border-field-border',
          disabled && 'opacity-50',
        )}
      >
        <RNText numberOfLines={1} className={cx('flex-1 text-base', selected ? 'text-field-foreground' : 'text-field-placeholder')}>
          {selected?.label ?? placeholder ?? t('select')}
        </RNText>
        <Icon name="chevron-down" size={18} />
      </Pressable>
      {error ? <RNText className="text-sm text-danger">{error}</RNText> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder ?? t('select')}>
        {searchable ? <Field value={filter} onChangeText={setFilter} placeholder={t('search')} autoCorrect={false} /> : null}
        <FlatList
          data={visible}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 420 }}
          ListHeaderComponent={
            clearLabel && onClear ? (
              <Pressable
                onPress={() => {
                  onClear()
                  setOpen(false)
                }}
                className="border-b border-border py-3"
              >
                <RNText className="text-base text-muted">{clearLabel}</RNText>
              </Pressable>
            ) : undefined
          }
          ListEmptyComponent={<Muted className="py-6 text-center">{t('noResults')}</Muted>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onChange(item.value)
                setOpen(false)
                setFilter('')
              }}
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-border py-3 active:opacity-70"
            >
              <View className="flex-1 pr-3">
                <RNText className="text-base text-foreground">{item.label}</RNText>
                {item.description ? <Muted>{item.description}</Muted> : null}
              </View>
              {item.value === value ? <Icon name="checkmark" size={20} /> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  )
}

interface DateFieldProps {
  label?: string
  /** `YYYY-MM-DD` or empty. */
  value: string | null | undefined
  onChange: (value: string) => void
  error?: string | null
  placeholder?: string
  minimumDate?: Date
  maximumDate?: Date
  clearable?: boolean
}

export function DateField({ label, value, onChange, error, placeholder, minimumDate, maximumDate, clearable = true }: DateFieldProps) {
  const t = useT('Mobile.common')
  const [open, setOpen] = useState(false)
  const current = value ? new Date(`${value}T12:00:00`) : new Date()
  if (Platform.OS === 'web') {
    return <Field label={label} value={value ?? ''} onChangeText={onChange} placeholder="YYYY-MM-DD" error={error} />
  }
  return (
    <View className="gap-1.5">
      {label ? <RNText className="text-sm font-medium text-foreground">{label}</RNText> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={cx('min-h-12 flex-row items-center justify-between rounded-xl border bg-field px-3', error ? 'border-danger' : 'border-field-border')}
      >
        <RNText className={cx('text-base', value ? 'text-field-foreground' : 'text-field-placeholder')}>
          {value ? formatDate(`${value}T12:00:00`) : (placeholder ?? t('select'))}
        </RNText>
        <Row className="gap-1">
          {clearable && value ? <IconButton icon="close-circle-outline" label={t('close')} onPress={() => onChange('')} size={18} /> : null}
          <Icon name="calendar-outline" size={18} />
        </Row>
      </Pressable>
      {error ? <RNText className="text-sm text-danger">{error}</RNText> : null}
      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={current}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(event, date) => {
            setOpen(false)
            if (event.type === 'set' && date) onChange(toDateInput(date))
          }}
        />
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_event, date) => {
              if (date) onChange(toDateInput(date))
            }}
          />
          <Button label={t('done')} onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </View>
  )
}

export function SwitchRow({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-1">
      <View className="flex-1">
        <RNText className="text-base text-foreground">{label}</RNText>
        {description ? <Muted>{description}</Muted> : null}
      </View>
      <HeroSwitch isSelected={value} onSelectedChange={onChange} isDisabled={disabled} accessibilityLabel={label} />
    </View>
  )
}

export function CheckRow({ label, value, onChange, error }: { label: string; value: boolean; onChange: (value: boolean) => void; error?: string | null }) {
  return (
    <View className="gap-1">
      <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} className="flex-row items-start gap-3 py-1">
        <View className={cx('mt-0.5 h-6 w-6 items-center justify-center rounded-md border', value ? 'border-accent bg-accent' : 'border-field-border bg-field')}>
          {value ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
        <RNText className="flex-1 text-base text-foreground">{label}</RNText>
      </Pressable>
      {error ? <RNText className="text-sm text-danger">{error}</RNText> : null}
    </View>
  )
}

export function Segmented<V extends string>({ value, onChange, options }: { value: V; onChange: (value: V) => void; options: readonly Option<V>[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cx('rounded-full border px-4 py-2', active ? 'border-accent bg-accent' : 'border-border bg-surface')}
          >
            <RNText className={cx('text-sm font-medium', active ? 'text-accent-foreground' : 'text-foreground')}>{option.label}</RNText>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/* --------------------------------- Display -------------------------------- */

export function Badge({ label, color = 'default' }: { label: string; color?: 'accent' | 'default' | 'success' | 'warning' | 'danger' }) {
  return (
    <HeroChip size="sm" variant="soft" color={color}>
      <HeroChip.Label>{label}</HeroChip.Label>
    </HeroChip>
  )
}

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name?: string | null; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 }
  if (uri) return <Image source={{ uri }} style={style} contentFit="cover" transition={150} accessibilityLabel={name ?? undefined} />
  return (
    <View style={style} className="items-center justify-center bg-default">
      <RNText className="font-semibold text-default-foreground" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </RNText>
    </View>
  )
}

interface ListRowProps {
  title: string
  subtitle?: string | null
  left?: ReactNode
  right?: ReactNode
  icon?: IconName
  onPress?: () => void
  chevron?: boolean
  destructive?: boolean
}

export function ListRow({ title, subtitle, left, right, icon, onPress, chevron, destructive }: ListRowProps) {
  const palette = usePalette(useCurrentSystem())
  const content = (
    <View className="flex-row items-center gap-3 py-3">
      {left ?? (icon ? <Icon name={icon} color={destructive ? palette.danger : undefined} /> : null)}
      <View className="flex-1">
        <RNText numberOfLines={2} className={cx('text-base', destructive ? 'text-danger' : 'text-foreground')}>
          {title}
        </RNText>
        {subtitle ? <Muted numberOfLines={2}>{subtitle}</Muted> : null}
      </View>
      {right}
      {chevron ?? !!onPress ? <Icon name="chevron-forward" size={18} color={palette.muted} /> : null}
    </View>
  )
  if (!onPress) return content
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-70">
      {content}
    </Pressable>
  )
}

export function KeyValue({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-1.5">
      <Muted className="flex-1">{label}</Muted>
      {typeof value === 'string' || typeof value === 'number' ? (
        <RNText className="flex-1 text-right text-base text-foreground">{value === '' ? '—' : value}</RNText>
      ) : (
        (value ?? <RNText className="text-base text-muted">—</RNText>)
      )}
    </View>
  )
}

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: IconName }) {
  return (
    <View className="min-w-36 flex-1 gap-1 rounded-2xl border border-border bg-surface p-4">
      <Row className="justify-between">
        <Muted>{label}</Muted>
        {icon ? <Icon name={icon} size={18} /> : null}
      </Row>
      <Title>{String(value)}</Title>
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  )
}

/* ---------------------------------- States -------------------------------- */

export function LoadingState() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-8">
      <Spinner size="lg" />
    </View>
  )
}

export function EmptyState({ title, description, icon = 'file-tray-outline', action }: { title?: string; description?: string; icon?: IconName; action?: ReactNode }) {
  const t = useT('Mobile.common')
  const palette = usePalette(useCurrentSystem())
  return (
    <View className="items-center gap-3 px-6 py-12">
      <Icon name={icon} size={40} color={palette.muted} />
      <Heading className="text-center">{title ?? t('empty')}</Heading>
      {description ? <Muted className="text-center">{description}</Muted> : null}
      {action}
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT('Mobile.common')
  const message = useErrorMessage()
  const palette = usePalette(useCurrentSystem())
  const icon: IconName = error instanceof ApiError && error.code === 'forbidden' ? 'lock-closed-outline' : error instanceof ApiError && error.code === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline'
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-6 py-12">
      <Icon name={icon} size={40} color={palette.muted} />
      <Text className="text-center">{message(error)}</Text>
      {onRetry ? <Button label={t('retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

/** Renders loading, error and data states of a query the same way on every screen. */
export function QueryView<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  return <LoadingState />
}

/* --------------------------------- Overlays ------------------------------- */

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const t = useT('Mobile.common')
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-backdrop" onPress={onClose} accessibilityLabel={t('close')} />
        <View className="max-h-[88%] gap-3 rounded-t-3xl bg-overlay px-4 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="h-1 w-10 self-center rounded-full bg-separator" />
          <View className="flex-row items-center justify-between">
            <Heading className="flex-1">{title ?? ''}</Heading>
            <IconButton icon="close" label={t('close')} onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  )
}

/** Native confirmation prompt. Resolves true only when the user confirms. */
export function confirm(options: { title: string; message?: string; confirmLabel: string; cancelLabel: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ask = (globalThis as { confirm?: (text: string) => boolean }).confirm
    return Promise.resolve(ask ? ask(`${options.title}${options.message ? `\n\n${options.message}` : ''}`) : false)
  }
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: options.confirmLabel, style: options.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

export function useNotify() {
  const { toast } = useToast()
  const message = useErrorMessage()
  return useMemo(
    () => ({
      success: (label: string) => toast.show({ variant: 'success', label }),
      info: (label: string) => toast.show({ variant: 'default', label }),
      error: (error: unknown) => toast.show({ variant: 'danger', label: typeof error === 'string' ? error : message(error) }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  )
}

/**
 * Runs a server action with consistent feedback: a toast for failures (both
 * thrown API errors and `{ ok: false }` results) and, optionally, for success.
 * Returns the successful response or null.
 */
export function useAction() {
  const notify = useNotify()
  const [pending, setPending] = useState(false)
  async function run<T>(
    call: () => Promise<ActionResponse<T>>,
    options: { success?: string | boolean; onSuccess?: (response: ActionResponse<T> & { ok: true }) => unknown } = {},
  ): Promise<(ActionResponse<T> & { ok: true }) | null> {
    setPending(true)
    try {
      const response = await call()
      if (!response.ok) {
        notify.error(response.message)
        return null
      }
      if (options.success === true ? response.message : options.success) {
        notify.success(typeof options.success === 'string' ? options.success : (response.message as string))
      }
      await options.onSuccess?.(response)
      return response
    } catch (error) {
      notify.error(error)
      return null
    } finally {
      setPending(false)
    }
  }
  return { run, pending }
}
