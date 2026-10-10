'use client'

import { useTranslations } from 'next-intl'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const PARTNER_STEPS = ['business', 'contact', 'address', 'administrator', 'modules'] as const
const CONSUMER_STEPS = ['consumer', 'consumerContact', 'purpose', 'guardian', 'premium'] as const

export function CustomerRegistrationSteps({ step, consumer = false }: { step: number; consumer?: boolean }) {
  const t = useTranslations('Customers')
  const steps = (consumer ? CONSUMER_STEPS : PARTNER_STEPS).map((key) => ({
    title: t(`sections.${key}`), description: t(`steps.${key}Desc`),
  }))

  return <nav aria-label={t('stepsNav')}>
    <div className="flex flex-wrap items-center gap-2 md:hidden">
      <div className="flex items-center gap-2" aria-hidden>
        {steps.map((_, index) => <div key={index} className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          index < step && 'bg-primary text-primary-foreground',
          index === step && 'ring-2 ring-primary bg-primary/10 text-primary',
          index > step && 'bg-muted text-muted-foreground',
        )}>{index < step ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}</div>)}
      </div>
      <p className="w-full text-sm font-medium">{steps[step].title}</p>
      <p className="text-xs text-muted-foreground">{steps[step].description}</p>
    </div>
    <ol className="hidden items-start md:flex">
      {steps.map((item, index) => <li key={index} aria-current={index === step ? 'step' : undefined} className="min-w-0 flex-1">
        <div className="flex items-center">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            index < step && 'bg-primary text-primary-foreground',
            index === step && 'ring-2 ring-primary ring-offset-2 bg-primary/10 text-primary',
            index > step && 'bg-muted text-muted-foreground',
          )}>{index < step ? <CheckIcon className="h-4 w-4" /> : index + 1}</div>
          {index < steps.length - 1 && <div className={cn('mx-3 h-px flex-1', index < step ? 'bg-primary' : 'bg-border')} />}
        </div>
        <div className="mt-2 pr-4">
          <p className={cn('text-sm font-semibold', index === step ? 'text-foreground' : 'text-muted-foreground')}>{item.title}</p>
          <p className="hidden text-xs text-muted-foreground lg:block">{item.description}</p>
        </div>
      </li>)}
    </ol>
  </nav>
}
