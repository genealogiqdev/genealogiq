import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { appHttp } from '@/api/app'
import { http } from '@/api/client'
import { countryOptions, stateOptions } from '@/features/app/countries'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { Field, Heading, IconButton, Muted, Row, SelectField, Text, useNotify } from '@/ui'

export interface AddressValue {
  zip: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  country: string
}

type AddressSource = Partial<Record<keyof AddressValue, string | null>> | null | undefined

/** Same defaults as the web `addressDefaultValues` (country BR). */
export function addressFrom(source: AddressSource): AddressValue {
  return {
    zip: source?.zip ?? '',
    street: source?.street ?? '',
    number: source?.number ?? '',
    complement: source?.complement ?? '',
    neighborhood: source?.neighborhood ?? '',
    city: source?.city ?? '',
    state: source?.state ?? '',
    country: source?.country ?? 'BR',
  }
}

/** Postal-level rows of /api/address/suggestions (never a number or complement). */
interface AddressSuggestion {
  zip: string | null
  street: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
}

interface AddressFieldsProps {
  title: string
  value: AddressValue
  onChange: (value: AddressValue) => void
}

export function AddressFields({ title, value, onChange }: AddressFieldsProps) {
  const t = useT('Common')
  const notify = useNotify()
  const locale = useLocale((state) => state.locale)
  const countries = useMemo(() => countryOptions(locale), [locale])
  const states = useMemo(() => stateOptions(value.country), [value.country])
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [looking, setLooking] = useState(false)

  const set = (key: keyof AddressValue) => (text: string) => onChange({ ...value, [key]: text })

  async function lookup() {
    const digits = value.zip.replace(/\D/g, '')
    const zip = digits || value.zip.trim()
    if (!zip || looking) return
    setLooking(true)
    try {
      const rows = await http<AddressSuggestion[]>('app', appHttp.addressSuggestions(zip))
      if (Array.isArray(rows) && rows.length > 0) setSuggestions(rows)
      else {
        setSuggestions([])
        notify.error(t('address.zipNotFound'))
      }
    } catch {
      notify.error(t('address.lookupError'))
    } finally {
      setLooking(false)
    }
  }

  function apply(row: AddressSuggestion) {
    // Number and complement are never autofilled from another address.
    onChange({
      ...value,
      zip: row.zip ?? value.zip,
      street: row.street ?? '',
      neighborhood: row.neighborhood ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      country: row.country ?? value.country,
    })
    setSuggestions([])
  }

  return (
    <View className="gap-3">
      <Heading>{title}</Heading>
      <SelectField
        label={t('address.country')}
        value={value.country || null}
        options={countries}
        onChange={(country) => onChange({ ...value, country, state: '' })}
        placeholder={t('address.selectPlaceholder')}
        searchable
      />
      <Field
        label={t('address.zipCode')}
        value={value.zip}
        onChangeText={(text) => {
          setSuggestions([])
          set('zip')(text)
        }}
        onSubmitEditing={() => void lookup()}
        returnKeyType="search"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        right={<IconButton icon={looking ? 'hourglass-outline' : 'search'} label={t('address.lookupAria')} onPress={() => void lookup()} size={20} />}
      />
      {suggestions.length > 0 ? (
        <View className="rounded-xl border border-border bg-surface px-3 py-2">
          <Muted>{t('address.suggestionsTitle')}</Muted>
          {suggestions.map((row, index) => (
            <Pressable
              key={`${row.street}-${row.neighborhood}-${row.city}-${index}`}
              onPress={() => apply(row)}
              accessibilityRole="button"
              className="min-h-11 justify-center border-t border-border py-2 active:opacity-70"
            >
              <Text>{[row.street, row.neighborhood].filter(Boolean).join(', ') || (row.zip ?? '')}</Text>
              <Muted>{[row.city, row.state, row.country].filter(Boolean).join(', ')}</Muted>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label={t('address.street')} value={value.street} onChangeText={set('street')} maxLength={200} />
      <Row className="items-start">
        <View className="flex-1">
          <Field label={t('address.number')} value={value.number} onChangeText={set('number')} maxLength={20} />
        </View>
        <View className="flex-1">
          <Field label={t('address.complement')} value={value.complement} onChangeText={set('complement')} maxLength={100} />
        </View>
      </Row>
      <Field label={t('address.neighborhood')} value={value.neighborhood} onChangeText={set('neighborhood')} maxLength={120} />
      <Field label={t('address.city')} value={value.city} onChangeText={set('city')} maxLength={120} />
      {states.length > 0 ? (
        <SelectField
          label={t('address.state')}
          value={value.state || null}
          options={states.some((option) => option.value === value.state) || !value.state ? states : [{ value: value.state, label: value.state }, ...states]}
          onChange={set('state')}
          placeholder={t('address.selectPlaceholder')}
          searchable
        />
      ) : (
        <Field label={t('address.state')} value={value.state} onChangeText={set('state')} maxLength={120} />
      )}
    </View>
  )
}
