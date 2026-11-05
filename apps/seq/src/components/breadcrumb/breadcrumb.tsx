'use client'

import * as React from 'react'
import * as Sentry from '@sentry/nextjs'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@genealogiq/ui/breadcrumb'

const RESOLVABLE = ['users', 'customers', 'business-customers', 'suppliers', 'memorialized', 'supplier-categories', 'customer-categories'] as const
type ResolvableType = (typeof RESOLVABLE)[number]

function formatSegment(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bQr\b/g, 'QR')
}

function useResolvedNames(segments: string[]) {
  const [names, setNames] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const toResolve: { type: ResolvableType; id: string }[] = []

    segments.forEach((segment, index) => {
      if (segment === 'business' || segment === 'new') return
      if (segments[index - 1] === 'business' && segments[index - 2] === 'customers') {
        toResolve.push({ type: 'business-customers', id: segment })
        return
      }
      const prev = segments[index - 1] as ResolvableType | undefined
      if (prev && RESOLVABLE.includes(prev)) {
        toResolve.push({ type: prev, id: segment })
      }
    })

    if (toResolve.length === 0) return

    toResolve.forEach(({ type, id }) => {
      fetch(`/api/entity-name?type=${type}&id=${id}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.name) {
            setNames((prev) => ({ ...prev, [id]: data.name }))
          }
        })
        .catch((error) => {
          // Non-critical: the breadcrumb falls back to the formatted segment.
          // Surface it as a warning instead of swallowing it silently.
          Sentry.captureException(error, { level: 'warning' })
        })
    })
  }, [segments.join('/')])

  return names
}

export function AppBreadcrumb() {
  const t = useTranslations('BusinessCustomers')
  const tc = useTranslations('Customers')
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const resolvedNames = useResolvedNames(segments)

  if (segments.length === 0) return null

  return (
    <Breadcrumb className="hidden md:flex">
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const href = segment === 'business' && segments[index - 1] === 'customers' ? '/customers?type=business' : '/' + segments.slice(0, index + 1).join('/')
          const isLast = index === segments.length - 1
          const label = resolvedNames[segment] ?? (segment === 'business' ? t('businessTab') : segment === 'customers' ? tc('title') : formatSegment(segment))

          return (
            <React.Fragment key={href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
