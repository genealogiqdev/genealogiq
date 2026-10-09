"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Network, PawPrint, UserRound } from "lucide-react"
import { toast } from "sonner"
import { addMemorialFromTree, type MemorialFromTreeResult } from "@/actions/tree-memorial.actions"
import type { TreeMemorialCandidate } from "@/queries/tree-memorial"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"

type Filter = "all" | "people" | "pets"
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const fullName = (profile: TreeMemorialCandidate) => `${profile.firstName} ${profile.lastName}`.trim()

export function TreeMemorialPicker({ profiles, guardianId }: {
  profiles: TreeMemorialCandidate[]
  guardianId: string
}) {
  const t = useTranslations("Memorialized")
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<TreeMemorialCandidate | null>(null)
  const [quota, setQuota] = useState<MemorialFromTreeResult["quota"]>()
  const [isPending, startTransition] = useTransition()
  const visible = profiles.filter((profile) =>
    (filter === "all" || (filter === "pets") === (profile.role === "APP_PET")) &&
    searchable(fullName(profile)).includes(searchable(search.trim())),
  )

  const handleAdd = () => {
    if (!selected || isPending) return
    startTransition(async () => {
      try {
        const result = await addMemorialFromTree({ profileId: selected.id })
        if (!result.ok) {
          if (result.quota) {
            setSelected(null)
            setQuota(result.quota)
          } else toast.error(result.message)
          return
        }
        setSelected(null)
        toast.success(result.data?.alreadyAdded ? t("fromTree.alreadyAdded") : t("fromTree.success"))
        router.push(`/profile/${guardianId}/memorialized`)
        router.refresh()
      } catch {
        toast.error(t("fromTree.error"))
      }
    })
  }

  return (
    <>
      <div className="glass-card p-4 sm:p-6 mb-5 space-y-4">
        <p className="text-sm text-muted-foreground">{t("fromTree.scopeHint")}</p>
        <div className="space-y-2">
          <Label htmlFor="tree-memorial-search">{t("fromTree.searchLabel")}</Label>
          <Input id="tree-memorial-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("fromTree.searchPlaceholder")} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("fromTree.filterLabel")}>
          {(["all", "people", "pets"] as const).map((value) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {t(`fromTree.${value}`)}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
          <Network className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground" role="status">{profiles.length === 0 ? t("fromTree.empty") : t("fromTree.noResults")}</p>
          {profiles.length === 0 && <Button variant="outline" asChild><Link href={`/profile/${guardianId}/tree`}>{t("fromTree.openTree")}</Link></Button>}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((profile) => {
            const isPet = profile.role === "APP_PET"
            const alreadyAdded = profile.role !== "APP_GHOST"
            const name = fullName(profile)
            const Icon = isPet ? PawPrint : UserRound
            const years = [profile.birthDate, profile.deathDate].map((date) => date ? new Date(date).getUTCFullYear() : null)
            return (
              <li key={profile.id} className="glass-card p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={profile.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{`${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="font-semibold break-words">{name}</h2>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {isPet ? profile.petSpecies || t("fromTree.pet") : t("fromTree.person")}
                      {years.some((year) => year !== null) && <span>· {years[0] ?? "?"} – {years[1] ?? "?"}</span>}
                    </p>
                  </div>
                </div>
                {alreadyAdded ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-auto">
                    <p className="text-xs text-muted-foreground">{t("fromTree.alreadyAdded")}</p>
                    <Button variant="outline" size="sm" asChild><Link href={`/profile/${profile.id}`}>{t("fromTree.viewProfile")}</Link></Button>
                  </div>
                ) : (
                  <Button className="mt-auto self-start" onClick={() => setSelected(profile)} disabled={isPending}>{t("fromTree.add")}</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog open={selected !== null} onOpenChange={(open) => { if (!open && !isPending) setSelected(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fromTree.confirmTitle", { name: selected ? fullName(selected) : "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("fromTree.confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("fromTree.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={(event) => { event.preventDefault(); handleAdd() }}>
              {isPending ? t("fromTree.adding") : t("fromTree.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LimitReachedDialog open={!!quota} onOpenChange={(open) => { if (!open) setQuota(undefined) }} context="memorials" limit={quota?.limit ?? 0} tier={quota?.tier ?? "FREE"} />
    </>
  )
}
