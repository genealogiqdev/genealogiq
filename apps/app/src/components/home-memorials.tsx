"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import { ProfileMiniCard, type MiniProfile } from "@/components/profile-mini-card"
import { getProfileGradient } from "@/lib/avatar-color"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import type { GuardedProfileRow } from "@/queries/memorial"

/** Home preview size; profile management is also reachable when empty. */
const VISIBLE = 6

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

type Translate = (key: string, values?: Record<string, string>) => string

function toMiniProfile(m: GuardedProfileRow, locale: string, t: Translate): MiniProfile {
  const isPet = m.role === "APP_PET"
  return {
    id: m.id,
    name: `${m.firstName} ${m.lastName}`.trim(),
    subtitle: isPet ? [m.petSpecies, m.petBreed].filter(Boolean).join(" · ") || t("petBadge") : m.birthPlace
      ? `${m.birthPlace}${m.birthCountry ? `, ${getCountryName(m.birthCountry, locale)}` : ""}`
      : t("memorializedProfile"),
    status: isPet ? "Pet" : "Memorialized",
    metric: m.deathDate
      ? t("deathMetric", { date: formatDateShort(m.deathDate, locale) })
      : m.birthDate
        ? t("bornMetric", { date: formatMonthYear(m.birthDate, locale) })
        : "",
    initials: `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase(),
    gradient: getProfileGradient(m.id),
    href: `/profile/${m.id}`,
    avatarUrl: m.avatarUrl,
  }
}

interface Props {
  items: GuardedProfileRow[]
}

export function HomeMemorials({ items }: Props) {
  const locale = useLocale()
  const t = useTranslations("Home")
  const [order, setOrder] = useState(items)

  useEffect(() => {
    setOrder(shuffle(items))
  }, [items])

  const visible = order.slice(0, VISIBLE)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {visible.map((m, i) => (
        <ProfileMiniCard key={m.id} profile={toMiniProfile(m, locale, t)} delay={i * 40} />
      ))}
    </div>
  )
}
