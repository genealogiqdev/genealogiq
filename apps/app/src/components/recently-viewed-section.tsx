'use client'

import { Users } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import { ProfileMiniCard, type MiniProfile } from "@/components/profile-mini-card"
import { getProfileGradient } from "@/lib/avatar-color"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import { useRecentlyViewed, type RecentProfile } from "@/hooks/use-recently-viewed"

type Translate = (key: string, values?: Record<string, string>) => string

function toMiniProfile(p: RecentProfile, locale: string, t: Translate): MiniProfile {
  const birthDate = p.birthDate ? new Date(p.birthDate) : null
  const deathDate = p.deathDate ? new Date(p.deathDate) : null
  const isPet = p.role === "APP_PET"
  const displayName = p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName
  return {
    id: p.id,
    name: displayName,
    subtitle: isPet
      ? [p.petBreed, p.petSpecies].filter(Boolean).join(", ")
      : p.birthPlace
      ? `${p.birthPlace}${p.birthCountry ? `, ${getCountryName(p.birthCountry, locale)}` : ""}`
      : p.isMemorialized ? t("memorializedProfile") : "",
    status: isPet ? "Pet" : p.isMemorialized ? "Memorialized" : "Living",
    metric: p.isMemorialized && deathDate
      ? t("deathMetric", { date: formatDateShort(deathDate, locale) })
      : birthDate
        ? t("bornMetric", { date: formatMonthYear(birthDate, locale) })
        : p.birthYear
          ? t("bornYearMetric", { year: String(p.birthYear) })
          : "",
    initials: (p.lastName ? `${p.firstName[0]}${p.lastName[0]}` : p.firstName.slice(0, 2)).toUpperCase(),
    gradient: getProfileGradient(p.id),
    href: `/profile/${p.id}`,
    avatarUrl: p.avatarUrl,
  }
}

export function RecentlyViewedSection() {
  const locale = useLocale()
  const t = useTranslations("Home")
  const profiles = useRecentlyViewed()

  if (profiles.length === 0) {
    return (
      <div className="glass-card no-sheen px-6 py-10 flex flex-col items-center justify-center gap-3 text-center">
        <Users className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("recentlyViewedEmpty")}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {profiles.slice(0, 6).map((p, i) => (
        <ProfileMiniCard
          key={p.id}
          profile={toMiniProfile(p, locale, t)}
          delay={i * 40}
          hideLivingBadge={!p.isMemorialized && p.role !== "APP_PET"}
        />
      ))}
    </div>
  )
}
