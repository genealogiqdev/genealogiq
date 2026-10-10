'use client'

import { useTranslations } from 'next-intl'
import type { CustomerCreateFormValues } from '@/schemas/customer.schema'
import { Field, FieldLabel } from '@genealogiq/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@genealogiq/ui/select'

export type CustomerRegistrationSegment = CustomerCreateFormValues['businessSegment'] | 'FINAL_CONSUMER'

export function CustomerSegmentSelect({ value, onValueChange }: {
  value: CustomerRegistrationSegment
  onValueChange: (value: CustomerRegistrationSegment) => void
}) {
  const t = useTranslations('Customers')
  return <Field>
    <FieldLabel htmlFor="customer-segment">{t('fields.businessSegment')}</FieldLabel>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id="customer-segment"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="FINAL_CONSUMER">{t('businessSegment.finalConsumer')}</SelectItem>
        <SelectItem value="FUNERAL_HOME">{t('businessSegment.funeralHome')}</SelectItem>
        <SelectItem value="MARBLE_SHOP">{t('businessSegment.marbleShop')}</SelectItem>
        <SelectItem value="CEMETERY">{t('businessSegment.cemetery')}</SelectItem>
        <SelectItem value="URN_MANUFACTURER">{t('businessSegment.urnManufacturer')}</SelectItem>
        <SelectItem value="PLAQUE_PRINTER">{t('businessSegment.plaquePrinter')}</SelectItem>
      </SelectContent>
    </Select>
  </Field>
}
