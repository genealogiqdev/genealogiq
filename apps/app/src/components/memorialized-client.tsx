"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowDownUp, Network, PawPrint, Plus, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProfileMiniCard, type MiniProfile } from "@/components/profile-mini-card"
import { LimitReachedDialog, type LimitReachedContext } from "@/components/limit-reached-dialog"
import type { PlanTier } from "@/lib/plan-quotas"

type SortDir = "az" | "za"

interface Props {
  profiles:     MiniProfile[]
  isOwn:        boolean
  // Create UI is only ever shown for your own memorials list (a guardian
  // viewing someone else's list never sees it, regardless of quota).
  showCreate:   boolean
  atLimit:      boolean
  memorialsMax: number
  petAtLimit:   boolean
  petsMax:      number
  tier:         PlanTier
  newHref:      string
  newPetHref:   string
  fromTreeHref: string
  upgradeHint?: ReactNode
}

export function MemorializedClient({
  profiles,
  isOwn,
  showCreate,
  atLimit,
  memorialsMax,
  petAtLimit,
  petsMax,
  tier,
  newHref,
  newPetHref,
  fromTreeHref,
  upgradeHint,
}: Props) {
  const t = useTranslations("Memorialized")
  const [sort, setSort] = useState<SortDir>("az")
  const [limitContext, setLimitContext] = useState<LimitReachedContext | null>(null)
  const isEmpty = profiles.length === 0

  const sorted = [...profiles].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name)
    return sort === "az" ? cmp : -cmp
  })

  return (
    <>
      <section className="mb-3 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 animate-fade-in">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-muted-foreground italic">{t("list.tagline")}</p>
          {upgradeHint}
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
          {!isEmpty && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" aria-label={t("list.sortAria")}>
                  <ArrowDownUp className="h-4 w-4" />
                  {sort === "az" ? t("list.sortAsc") : t("list.sortDesc")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSort("az")}>{t("list.sortAsc")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort("za")}>{t("list.sortDesc")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {showCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("list.new")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={fromTreeHref}>
                    <Network className="h-4 w-4" />
                    {t("list.fromTree")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {atLimit ? (
                  <DropdownMenuItem onSelect={() => setLimitContext("memorials")}>
                    <UserRound className="h-4 w-4" />
                    {t("list.newPerson")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href={newHref}>
                      <UserRound className="h-4 w-4" />
                      {t("list.newPerson")}
                    </Link>
                  </DropdownMenuItem>
                )}
                {petAtLimit ? (
                  <DropdownMenuItem onSelect={() => setLimitContext("pets")}>
                    <PawPrint className="h-4 w-4" />
                    {t("list.newPet")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href={newPetHref}>
                      <PawPrint className="h-4 w-4" />
                      {t("list.newPet")}
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </section>

      {isEmpty ? (
        <div className="glass-card flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
          <p className="text-muted-foreground">
            {isOwn ? t("list.emptyOwn") : t("list.emptyGuarded")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: "80ms" }}>
          {sorted.map((p, i) => (
            <ProfileMiniCard key={p.id} profile={p} delay={i * 40} />
          ))}
        </div>
      )}

      <LimitReachedDialog
        open={limitContext !== null}
        onOpenChange={(open) => { if (!open) setLimitContext(null) }}
        context={limitContext ?? "memorials"}
        limit={limitContext === "pets" ? petsMax : memorialsMax}
        tier={tier}
      />
    </>
  )
}
