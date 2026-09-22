"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import { Heart } from "lucide-react"
import { ProfileMiniCard, type MiniProfile, type AvatarGradient } from "@/components/profile-mini-card"
import { formatDateShort, formatMonthYear } from "@/lib/format-date"
import type { FavoriteRow } from "@/queries/favorite"

type Translate = (key: string, values?: Record<string, string>) => string

const PAGE_SIZE = 12

const GRADIENTS: AvatarGradient[] = ["brand", "indigo", "violet", "sky", "rose", "amber", "emerald"]

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function toMiniProfile(fav: FavoriteRow, index: number, locale: string, t: Translate): MiniProfile {
  const target = fav.target
  const name = target.lastName ? `${target.firstName} ${target.lastName}` : target.firstName
  const isMemorialized = target.role === "APP_MEMO"
  const isPet = target.role === "APP_PET"
  const subtitle = isPet
    ? [target.petBreed, target.petSpecies].filter(Boolean).join(", ")
    : target.birthPlace
    ? `${target.birthPlace}${target.birthCountry ? `, ${getCountryName(target.birthCountry, locale)}` : ""}`
    : isMemorialized
      ? t("memorializedProfile")
      : ""
  return {
    id: target.id,
    name,
    subtitle,
    status: isPet ? "Pet" : isMemorialized ? "Memorialized" : "Living",
    metric: isMemorialized && target.deathDate
      ? t("deathMetric", { date: formatDateShort(target.deathDate, locale) })
      : target.birthDate
        ? t("bornMetric", { date: formatMonthYear(target.birthDate, locale) })
        : target.birthYear
          ? t("bornYearMetric", { year: String(target.birthYear) })
          : "",
    initials: (target.lastName ? `${target.firstName[0]}${target.lastName[0]}` : target.firstName.slice(0, 2)).toUpperCase(),
    gradient: GRADIENTS[index % GRADIENTS.length],
    href: `/profile/${target.id}`,
    avatarUrl: target.avatarUrl,
  }
}

interface Props {
  items: FavoriteRow[]
}

export function FavoritesClient({ items }: Props) {
  const locale = useLocale()
  const t = useTranslations("Favorites")
  // Start with original order (SSR-safe); shuffle client-side on mount to avoid hydration mismatch
  const [shuffled, setShuffled] = useState(items)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setShuffled(shuffle(items))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (visibleCount >= shuffled.length) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, shuffled.length))
      },
      { rootMargin: "300px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, shuffled.length])

  if (items.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
        <Heart className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{t("empty")}</p>
      </div>
    )
  }

  const visible = shuffled.slice(0, visibleCount)

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: "80ms" }}>
        {visible.map((fav, i) => {
          const isMemorialized = fav.target.role === "APP_MEMO"
          const isPet = fav.target.role === "APP_PET"
          return (
            <ProfileMiniCard
              key={fav.targetId}
              profile={toMiniProfile(fav, i, locale, t)}
              delay={i * 40}
              hideLivingBadge={!isMemorialized && !isPet}
            />
          )
        })}
      </div>

      {visibleCount < shuffled.length && (
        <div ref={sentinelRef} className="h-16" aria-hidden />
      )}
    </>
  )
}
