"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import { ProfileMiniCard, type MiniProfile } from "@/components/profile-mini-card"
import { getProfileGradient } from "@/lib/avatar-color"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import type { FavoriteRow } from "@/queries/favorite"

/** How many cards this section renders — also the point above which a
 *  "see all" link is worth showing. Exported so the two cannot drift. */
export const VISIBLE = 6

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

type Translate = (key: string, values?: Record<string, string>) => string

function toMiniProfile(fav: FavoriteRow, locale: string, t: Translate): MiniProfile {
  const p = fav.target
  const isMemorialized = p.role === "APP_MEMO"
  const isPet = p.role === "APP_PET"
  return {
    id: p.id,
    name: p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName,
    subtitle: isPet
      ? [p.petBreed, p.petSpecies].filter(Boolean).join(", ")
      : p.birthPlace
      ? `${p.birthPlace}${p.birthCountry ? `, ${getCountryName(p.birthCountry, locale)}` : ""}`
      : isMemorialized ? t("memorializedProfile") : "",
    status: isPet ? "Pet" : isMemorialized ? "Memorialized" : "Living",
    metric: isMemorialized && p.deathDate
      ? t("deathMetric", { date: formatDateShort(p.deathDate, locale) })
      : p.birthDate
        ? t("bornMetric", { date: formatMonthYear(p.birthDate, locale) })
        : "",
    initials: (p.lastName ? `${p.firstName[0]}${p.lastName[0]}` : p.firstName.slice(0, 2)).toUpperCase(),
    gradient: getProfileGradient(p.id),
    href: `/profile/${p.id}`,
    avatarUrl: p.avatarUrl,
  }
}

interface Props {
  items: FavoriteRow[]
}

export function HomeFavorites({ items }: Props) {
  const locale = useLocale()
  const t = useTranslations("Home")
  // Render the original order on SSR to avoid hydration mismatch; shuffle on mount.
  const [order, setOrder] = useState(items)

  useEffect(() => {
    setOrder(shuffle(items))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = order.slice(0, VISIBLE)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {visible.map((fav, i) => (
        <ProfileMiniCard
          key={fav.targetId}
          profile={toMiniProfile(fav, locale, t)}
          delay={i * 40}
          hideLivingBadge={fav.target.role !== "APP_MEMO"}
        />
      ))}
    </div>
  )
}
