'use client'

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import { Cake, Feather, Heart, Images, Flower, MapPin, SquarePen, BrickWall, User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toggleFavorite } from "@/actions/favorite.actions"
import { SignupDialog } from "@/components/auth/signup-dialog"
import { toast } from "sonner"

export interface ProfileData {
  id: string
  name: string
  initials: string
  avatarColor: string
  type: "living" | "memorialized" | "pet"
  avatarUrl?: string | null
  birth?: { date: string; place: string; country?: string | null; yearOnly?: boolean } | null
  death?: { date: string; place: string; country?: string | null; yearOnly?: boolean } | null
  geo?: { lat: number; lon: number } | null
  tributes: number
  favoritedBy: number
  mediaTotal: number
  isOwn: boolean
  isGuardian: boolean
  guardians?: { id: string; firstName: string }[]
  guardedCount: number
  isFavoritedByMe?: boolean
  isAuthenticated?: boolean
}

interface Props {
  profile: ProfileData
  downloadActions?: ReactNode
}

const formatPlace = (place: string, country: string | null | undefined, locale: string) =>
  [place, getCountryName(country, locale)].filter(Boolean).join(", ")

export function ProfileBanner({ profile, downloadActions }: Props) {
  const locale = useLocale()
  const t = useTranslations("Profile")
  const isMemorial = profile.type === "memorialized"
  const isPet = profile.type === "pet"
  const isAuthenticated = profile.isAuthenticated ?? true
  const canEdit = profile.isOwn || profile.isGuardian
  const geo = profile.geo && (profile.geo.lat !== 0 || profile.geo.lon !== 0) ? profile.geo : null
  const guardians = isAuthenticated && profile.guardians?.length ? profile.guardians : null
  const [favorited, setFavorited] = useState(profile.isFavoritedByMe ?? false)
  const [favCount, setFavCount] = useState(profile.favoritedBy)
  const [isPending, startTransition] = useTransition()
  const [wallOpen, setWallOpen] = useState(false)

  const fallback = (size: string) => (
    <AvatarFallback className={cn("font-semibold text-white", size, profile.avatarColor)}>
      {profile.initials}
    </AvatarFallback>
  )

  return (
    <section className="relative animate-fade-in pt-24 sm:pt-28 md:pt-28 lg:pt-12">
      <div className="container relative md:mt-6 lg:mt-0">
        <div className="relative animate-scale-in">
          {/* Mobile avatar */}
          <div className="lg:hidden absolute left-1/2 -translate-x-1/2 z-20 -top-12 sm:-top-14 md:-top-20">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 md:h-40 md:w-40 ring-4 ring-background shadow-[var(--shadow-glass)]">
              <AvatarImage src={profile.avatarUrl ?? ""} alt={profile.name} />
              {fallback("text-3xl")}
            </Avatar>
          </div>

          <div className="glass-card-deep no-sheen relative px-6 pt-16 pb-8 sm:pt-20 sm:pb-10 md:pt-24 md:pb-8 md:px-8 lg:py-6 xl:py-7 lg:px-10">
            {/* Action buttons */}
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              {canEdit && (
                <Link
                  href={`/profile/${profile.id}/edit`}
                  aria-label={t("editProfileAria")}
                  className="h-10 w-10 rounded-full inline-flex items-center justify-center transition-transform hover:scale-110 active:scale-95 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                >
                  <SquarePen className="h-5 w-5" />
                </Link>
              )}
              {!profile.isOwn && isAuthenticated && (
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const next = !favorited
                      setFavorited(next)
                      setFavCount((c) => c + (next ? 1 : -1))
                      const result = await toggleFavorite(profile.id)
                      if (!result.ok) {
                        setFavorited(!next)
                        setFavCount((c) => c + (next ? -1 : 1))
                        toast.error(result.message)
                      }
                    })
                  }}
                  disabled={isPending}
                  aria-label={favorited ? t("removeFromFavorites") : t("addToFavorites")}
                  className="h-10 w-10 rounded-full glass border-0 inline-flex items-center justify-center transition-transform hover:scale-110 active:scale-95 disabled:opacity-60"
                >
                  <Heart
                    className={cn(
                      "h-5 w-5 transition-colors",
                      favorited ? "fill-rose-500 text-rose-500" : "text-muted-foreground",
                    )}
                  />
                </button>
              )}
              {!profile.isOwn && !isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setWallOpen(true)}
                  aria-label={t("addToFavorites")}
                  className="h-10 w-10 rounded-full glass border-0 inline-flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                >
                  <Heart className="h-5 w-5 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:text-left lg:gap-8">
              {/* Desktop avatar */}
              <div className="hidden lg:block shrink-0 z-10">
                <Avatar className="h-44 w-44 xl:h-52 xl:w-52 ring-4 ring-background shadow-[var(--shadow-glass)]">
                  <AvatarImage src={profile.avatarUrl ?? ""} alt={profile.name} />
                  {fallback("text-5xl")}
                </Avatar>
              </div>

              <div className="flex-1 min-w-0 w-full">
                {/* Badges */}
                <TooltipProvider delayDuration={200}>
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-3">
                    {isMemorial && (
                      <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                        {t("memorialized")}
                      </Badge>
                    )}
                    {isPet && (
                      <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                        {t("petBadge")}
                      </Badge>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                          <Images className="h-3 w-3 mr-1" />
                          {profile.mediaTotal}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{t("tooltipMedia")}</TooltipContent>
                    </Tooltip>
                    {!isPet && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                            <Flower className="h-3 w-3 mr-1" />
                            {profile.tributes}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{t("tooltipTributes")}</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                          <Heart className="h-3 w-3 mr-1" />
                          {favCount}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{t("tooltipFavorites")}</TooltipContent>
                    </Tooltip>
                    {!isMemorial && !isPet && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="rounded-full glass border-0 text-xs font-medium">
                            <BrickWall className="h-3 w-3 mr-1" />
                            {profile.guardedCount}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{t("tooltipGuarded")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>

                <h1 className="text-3xl lg:text-5xl font-semibold leading-tight tracking-tight truncate">
                  {profile.name}
                </h1>

                <div className="mt-4 flex flex-col gap-2 text-sm min-w-0">
                  {profile.birth && (
                    <div className="flex items-center gap-2 text-muted-foreground justify-center lg:justify-start min-w-0">
                      <Cake className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate min-w-0">
                        {profile.birth.yearOnly
                          ? t.rich("bornInYear", {
                              year: profile.birth.date,
                              strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                            })
                          : profile.birth.place
                            ? t.rich("bornOnInPlace", {
                                date: profile.birth.date,
                                place: formatPlace(profile.birth.place, profile.birth.country, locale),
                                strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                              })
                            : t.rich("bornOn", {
                                date: profile.birth.date,
                                strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                              })}
                      </span>
                    </div>
                  )}
                  {(isMemorial || isPet) && profile.death && (
                    <div className="flex items-center gap-2 text-muted-foreground justify-center lg:justify-start min-w-0">
                      <Feather className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate min-w-0">
                        {profile.death.yearOnly
                          ? t.rich("deceasedInYear", {
                              year: profile.death.date,
                              strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                            })
                          : profile.death.place
                            ? t.rich("deceasedOnInPlace", {
                                date: profile.death.date,
                                place: formatPlace(profile.death.place, profile.death.country, locale),
                                strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                              })
                            : t.rich("deceasedOn", {
                                date: profile.death.date,
                                strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
                              })}
                      </span>
                    </div>
                  )}
                  {(isMemorial || isPet) && (geo || guardians) && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center lg:justify-start min-w-0">
                      {geo && (
                        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                          <MapPin className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate min-w-0">
                            {t("coordinatesLabel")}{" "}
                            <Link
                              href={`/profile/${profile.id}/places`}
                              className="text-foreground font-medium hover:underline"
                            >
                              {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}
                            </Link>
                          </span>
                        </div>
                      )}
                      {guardians && (
                        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate min-w-0">
                            {t("guardianLabel", { count: guardians.length })}{" "}
                            {guardians.slice(0, 3).map((guardian, index) => (
                              <span key={guardian.id}>
                                {index > 0 && ", "}
                                <Link href={`/profile/${guardian.id}`} className="text-foreground font-medium hover:underline">
                                  {guardian.firstName}
                                </Link>
                              </span>
                            ))}
                            {guardians.length > 3 && ` +${guardians.length - 3}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {downloadActions && (
                  <div className="mt-6 flex justify-center lg:justify-start">
                    {downloadActions}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!profile.isOwn && !isAuthenticated && (
        <SignupDialog open={wallOpen} onOpenChange={setWallOpen} dismissible />
      )}
    </section>
  )
}
