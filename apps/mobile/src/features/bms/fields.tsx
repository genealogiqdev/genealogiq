import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Address } from '@/api/bms'
import { useT } from '@/i18n'
import { usePalette } from '@/theme'
import { Badge, Button, EmptyState, Field, IconButton, Muted, Row, SelectField, Text, useNotify } from '@/ui'
import { parseNumber, type Errors } from './lib'

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-xl bg-default p-3">
      <Muted>{children}</Muted>
    </View>
  )
}

/** Shown on forms a read-only role opened: the fields stay visible, the controls do not. */
export function ReadOnlyNote() {
  const t = useT('Mobile.bms')
  return <Note>{t('readOnly')}</Note>
}

export function StatusBadge({ active }: { active: boolean }) {
  const t = useT('Mobile.common')
  return <Badge label={active ? t('active') : t('inactive')} color={active ? 'success' : 'danger'} />
}

interface NumFieldProps {
  label?: string
  value: number
  onChange: (value: number) => void
  error?: string | null
  hint?: string
  integer?: boolean
  disabled?: boolean
}

/** Numeric input that keeps the typed text (so "1," or an empty box can exist) and reports a number (NaN when empty). */
export function NumField({ label, value, onChange, error, hint, integer, disabled }: NumFieldProps) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '')
  useEffect(() => {
    if (Number.isFinite(value) && parseNumber(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Field
      label={label}
      value={text}
      onChangeText={(next) => {
        setText(next)
        onChange(parseNumber(next))
      }}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      error={error}
      hint={hint}
      disabled={disabled}
    />
  )
}

const PHONE_CODES = ['55', '52', '1'] as const

export function PhoneFields({
  code,
  phone,
  onCode,
  onPhone,
  codeLabel,
  phoneLabel,
  errors,
  disabled,
}: {
  code: string
  phone: string
  onCode: (value: string) => void
  onPhone: (value: string) => void
  codeLabel: string
  phoneLabel: string
  errors?: Errors
  disabled?: boolean
}) {
  const options = [...new Set([...PHONE_CODES, ...(code ? [code] : [])])].map((value) => ({ value, label: `+${value}` }))
  return (
    <View className="gap-4">
      <SelectField label={codeLabel} value={code} options={options} onChange={onCode} error={errors?.phoneCountryCode} disabled={disabled} />
      <Field label={phoneLabel} value={phone} onChangeText={onPhone} keyboardType="phone-pad" error={errors?.phone} disabled={disabled} />
    </View>
  )
}

const COUNTRIES = ['BR', 'US', 'MX'] as const

interface ZipResult {
  street: string
  neighborhood: string
  city: string
  state: string
}

/** The same public postal-code services the web form queries. Only the code itself is sent. */
async function lookupZip(country: string, zip: string): Promise<ZipResult> {
  const digits = zip.replace(/\D/g, '')
  if (country === 'BR') {
    if (digits.length !== 8) throw new Error('zip')
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (!response.ok || data.erro) throw new Error('zip')
    return { street: data.logradouro ?? '', neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' }
  }
  const response = await fetch(`https://api.zippopotam.us/${country.toLowerCase()}/${digits.slice(0, 5)}`)
  if (!response.ok) throw new Error('zip')
  const data = (await response.json()) as { places?: Record<string, string>[] }
  const place = data.places?.[0]
  if (!place) throw new Error('zip')
  return { street: '', neighborhood: '', city: place['place name'] ?? '', state: place['state abbreviation'] ?? '' }
}

export const EMPTY_ADDRESS: Address = { zip: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', country: 'BR' }

export function AddressFields({ value, onChange, disabled }: { value: Address | null | undefined; onChange: (value: Address) => void; disabled?: boolean }) {
  const t = useT('Common')
  const tm = useT('Mobile.bms')
  const notify = useNotify()
  const [searching, setSearching] = useState(false)
  const address = { ...EMPTY_ADDRESS, ...(value ?? {}) }
  const country = address.country || 'BR'
  const set = (patch: Partial<Address>) => onChange({ ...address, ...patch })
  const countries = [...new Set<string>([...COUNTRIES, country])].map((code) => ({
    value: code,
    label: tm.has(`countries.${code}`) ? tm(`countries.${code}`) : code,
  }))

  async function search() {
    if (!address.zip) return
    setSearching(true)
    try {
      const found = await lookupZip(country, address.zip)
      set(found)
    } catch {
      notify.error(t('address.lookupError'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <View className="gap-4">
      <SelectField label={t('address.country')} value={country} options={countries} onChange={(next) => set({ country: next, state: '', zip: '' })} disabled={disabled} />
      <Field
        label={t('address.zipCode')}
        value={address.zip ?? ''}
        onChangeText={(zip) => set({ zip: zip.replace(/\D/g, '') })}
        keyboardType="number-pad"
        disabled={disabled || searching}
        onSubmitEditing={() => void search()}
        right={disabled ? undefined : <IconButton icon="search" label={t('address.lookupAria')} onPress={() => void search()} size={20} />}
      />
      <Field label={t('address.street')} value={address.street ?? ''} onChangeText={(street) => set({ street })} disabled={disabled} />
      <Field label={t('address.number')} value={address.number ?? ''} onChangeText={(number) => set({ number })} disabled={disabled} />
      <Field label={t('address.complement')} value={address.complement ?? ''} onChangeText={(complement) => set({ complement })} disabled={disabled} />
      <Field label={t('address.neighborhood')} value={address.neighborhood ?? ''} onChangeText={(neighborhood) => set({ neighborhood })} disabled={disabled} />
      <Field label={t('address.city')} value={address.city ?? ''} onChangeText={(city) => set({ city })} disabled={disabled} />
      <Field label={t('address.state')} value={address.state ?? ''} onChangeText={(state) => set({ state })} autoCapitalize="characters" disabled={disabled} />
    </View>
  )
}

interface ListViewProps<T> {
  data: readonly T[]
  keyOf: (item: T) => string
  render: (item: T) => ReactElement
  header?: ReactElement
  emptyTitle?: string
  refreshing: boolean
  onRefresh: () => void
}

/** Virtualised list with pull-to-refresh and an empty state, on the screen background. */
export function ListView<T>({ data, keyOf, render, header, emptyTitle, refreshing, onRefresh }: ListViewProps<T>) {
  const insets = useSafeAreaInsets()
  const palette = usePalette('bms')
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: palette.bg }}
      data={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => render(item)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState title={emptyTitle} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
    />
  )
}

/** Search box with a clear button; filtering is the caller's. */
export function SearchBox({ value, onChange, placeholder, onSubmit }: { value: string; onChange: (value: string) => void; placeholder: string; onSubmit?: () => void }) {
  const t = useT('Mobile.common')
  return (
    <Field
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      onSubmitEditing={onSubmit}
      accessibilityLabel={placeholder}
      right={value ? <IconButton icon="close-circle-outline" label={t('close')} onPress={() => onChange('')} size={18} /> : undefined}
    />
  )
}

/** Title on the left, a small action on the right. */
export function HeaderAction({ label, onPress, icon = 'add' }: { label: string; onPress: () => void; icon?: 'add' | 'pricetag-outline' }) {
  return (
    <Row className="justify-end">
      <Button label={label} icon={icon} size="sm" onPress={onPress} />
    </Row>
  )
}
