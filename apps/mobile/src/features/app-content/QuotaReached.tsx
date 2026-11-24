import { useState } from 'react'
import type { PlanTier } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useT } from '@/i18n'
import { Button, EmptyState, Screen, type IconName } from '@/ui'
import { useLeave } from './common'

interface QuotaReachedProps {
  context: 'documents' | 'geoPlaces'
  limit: number
  tier: PlanTier
  icon: IconName
  backLabel: string
  backPath: string
}

/** Body of a "new" screen opened at the plan limit: explains the limit and offers the way past it. */
export function QuotaReached({ context, limit, tier, icon, backLabel, backPath }: QuotaReachedProps) {
  const t = useT('LimitReached')
  const leave = useLeave()
  const [open, setOpen] = useState(true)
  return (
    <Screen>
      <EmptyState
        icon={icon}
        title={t(`title.${context}`)}
        description={t(`description.${context}`, { limit })}
        action={<Button label={t('cta.extraOnly')} onPress={() => setOpen(true)} />}
      />
      <Button label={backLabel} variant="ghost" onPress={() => leave.back(backPath)} fullWidth />
      <LimitReachedSheet visible={open} onClose={() => setOpen(false)} context={context} limit={limit} tier={tier} />
    </Screen>
  )
}
