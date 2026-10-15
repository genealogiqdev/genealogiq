'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Mail } from 'lucide-react'
import { Button } from '@genealogiq/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@genealogiq/ui/card'
import { resendCustomerEmail } from '@/actions/customer.actions'

type AccessOwner = { email: string; isActive: boolean }

export function CustomerAccessCard({ id, owner }: { id: string; owner: AccessOwner | null }) {
  const t = useTranslations('Customers')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function resend() {
    setError(null)
    setSent(false)
    startTransition(async () => {
      try {
        const result = await resendCustomerEmail(id)
        if (!result.ok) { setError(result.message); return }
        setSent(true)
      } catch {
        setError(t('access.error'))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('access.title')}</CardTitle>
        <CardDescription>{t('access.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {owner && <p className="break-all text-sm">{t('access.recipient', { email: owner.email })}</p>}
        {!owner && <p className="text-sm text-muted-foreground">{t('access.noOwner')}</p>}
        {owner && !owner.isActive && <p className="text-sm text-muted-foreground">{t('access.inactive')}</p>}
        <Button type="button" variant="outline" disabled={pending || !owner?.isActive} onClick={resend}>
          <Mail aria-hidden="true" />
          {pending ? t('access.sending') : t('actions.resendEmail')}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sent && owner && <p role="status" className="text-sm">{t('access.sent', { email: owner.email })}</p>}
      </CardContent>
    </Card>
  )
}
