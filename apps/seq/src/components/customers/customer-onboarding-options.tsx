'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@genealogiq/ui/input'

interface Props {
  email: string
  premium: boolean
  genCode: string
  canManage: boolean
  onPremiumChange: (value: boolean) => void
  onGenCodeChange: (value: string) => void
}

export function CustomerOnboardingOptions({ email, premium, genCode, canManage, onPremiumChange, onGenCodeChange }: Props) {
  const t = useTranslations('PremiumAccess')
  const id = useId()
  return <section className="space-y-5">
    <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
      <h2 className="font-semibold">{t('invitationTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('invitationDescription', { email })}</p>
    </div>
    <fieldset className="space-y-3">
      <legend className="mb-3 font-semibold">{t('onboardingTitle')}</legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
        <input type="radio" name={`${id}-access`} checked={!premium} onChange={() => onPremiumChange(false)} className="mt-1 accent-primary" />
        <span><span className="block font-medium">{t('registrationOnly')}</span><span className="text-sm text-muted-foreground">{t('registrationDescription')}</span></span>
      </label>
      {canManage && <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-primary/5">
        <input type="radio" name={`${id}-access`} checked={premium} onChange={() => onPremiumChange(true)} className="mt-1 accent-primary" />
        <span><span className="block font-medium">{t('saleAndPremium')}</span><span className="text-sm text-muted-foreground">{t('saleDescription')}</span></span>
      </label>}
      {!canManage && <p className="text-sm text-muted-foreground">{t('adminRequired')}</p>}
    </fieldset>
    {premium && canManage && <div className="space-y-2">
      <label htmlFor={`${id}-code`} className="text-sm font-medium">{t('codeOptional')}</label>
      <Input id={`${id}-code`} value={genCode} maxLength={64} onChange={(e) => onGenCodeChange(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" className="sm:max-w-md" />
      <p className="text-sm text-muted-foreground">{t('codeOptionalHelp')}</p>
    </div>}
  </section>
}
