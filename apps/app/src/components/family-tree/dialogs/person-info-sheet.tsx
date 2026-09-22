'use client'

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { getCountryName } from "@genealogiq/core"
import Link from "next/link"
import { Trash2, SquarePen, Cake, Heart, HeartCrack, Flower, ArrowUpRight, Shield, Hourglass } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { removeMember } from "@/actions/family-tree.actions"
import { detachPetFromTree } from "@/actions/pet.actions"
import { requestGuardianship } from "@/actions/guardian.actions"
import { relationFromRoot } from "@/lib/family-relation-label"
import { formatDateShort } from "@/lib/format-date"
import { EditRelationDialog } from "./edit-relation-dialog"
import type { TreePerson, TreePetOwnership, TreeRelation } from "@/queries/family-tree"

type Kind = "parent" | "child" | "spouse" | "sibling" | "pet"

interface Props {
  open:           boolean
  onClose:        () => void
  person:         TreePerson | null
  rootId:         string
  persons:        Record<string, TreePerson>
  relations:      TreeRelation[]
  petOwnerships:  TreePetOwnership[]
  canManage:      boolean
  managedIds:     string[]
  requestedIds:   string[]
  sessionUserId?: string
  onEdit:         () => void
  onAddRelative:  (anchorId: string, kind: Kind) => void
  onSuccess:      () => void
}

type Event =
  | { id: string; type: "BORN";       date: Date | null; year: number | null; place: string | null }
  | { id: string; type: "MARRIED";    date: Date | null; spouseName: string;  status: string }
  | { id: string; type: "DIVORCED";   date: Date | null; spouseName: string }
  | { id: string; type: "DIED";       date: Date | null; year: number | null; place: string | null }

function eventDateMs(e: Event): number {
  if (e.date) return new Date(e.date).getTime()
  if ("year" in e && e.year) return Date.UTC(e.year, 0, 1)
  return 0
}

function buildEvents(person: TreePerson, persons: Record<string, TreePerson>, relations: TreeRelation[], locale: string): Event[] {
  const events: Event[] = []

  // A redacted person has birthDate=null but birthYear still populated — keep
  // the BORN event (year-only) instead of dropping it entirely.
  if (person.birthDate || person.birthPlace || person.birthYear) {
    events.push({
      id:    `born-${person.id}`,
      type:  "BORN",
      date:  person.birthDate,
      year:  person.birthYear,
      place: person.birthPlace
        ? person.birthCountry ? `${person.birthPlace}, ${getCountryName(person.birthCountry, locale)}` : person.birthPlace
        : null,
    })
  }

  for (const r of relations) {
    if (r.type !== "SPOUSE") continue
    if (r.fromId !== person.id && r.toId !== person.id) continue
    const spouseId = r.fromId === person.id ? r.toId : r.fromId
    const spouse = persons[spouseId]
    if (!spouse) continue
    const name = `${spouse.firstName} ${spouse.lastName}`
    if (r.subtype === "divorced") {
      events.push({ id: `married-${r.id}`,  type: "MARRIED",  date: r.startDate, spouseName: name, status: "divorced" })
      events.push({ id: `divorced-${r.id}`, type: "DIVORCED", date: r.endDate,   spouseName: name })
    } else {
      events.push({ id: `married-${r.id}`, type: "MARRIED", date: r.startDate, spouseName: name, status: r.subtype ?? "married" })
    }
  }

  if (person.deathDate || person.deathPlace || person.deathYear) {
    events.push({
      id:    `died-${person.id}`,
      type:  "DIED",
      date:  person.deathDate,
      year:  person.deathYear,
      place: person.deathPlace
        ? person.deathCountry ? `${person.deathPlace}, ${getCountryName(person.deathCountry, locale)}` : person.deathPlace
        : null,
    })
  }

  events.sort((a, b) => eventDateMs(a) - eventDateMs(b))
  return events
}

function eventIcon(type: Event["type"]) {
  if (type === "BORN")     return <Cake       className="h-3.5 w-3.5" />
  if (type === "MARRIED")  return <Heart      className="h-3.5 w-3.5" />
  if (type === "DIVORCED") return <HeartCrack className="h-3.5 w-3.5" />
  return <Flower className="h-3.5 w-3.5" />
}

type EventTranslator = (key: string, values?: Record<string, string>) => string

function eventLabel(e: Event, t: EventTranslator): string {
  if (e.type === "BORN")     return e.place ? t("timeline.bornIn", { place: e.place }) : t("timeline.born")
  if (e.type === "DIED")     return e.place ? t("timeline.diedIn", { place: e.place }) : t("timeline.died")
  if (e.type === "DIVORCED") return t("timeline.divorcedFrom", { name: e.spouseName })
  return t("timeline.married", { name: e.spouseName })
}

export function PersonInfoSheet({
  open, onClose, person, rootId, persons, relations, petOwnerships,
  canManage, managedIds, requestedIds, sessionUserId,
  onEdit, onAddRelative, onSuccess,
}: Props) {
  const locale = useLocale()
  const t = useTranslations("FamilyTree")
  const tc = useTranslations("Common")
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  const [requesting, startRequest] = useTransition()
  const [editingRelation, setEditingRelation] = useState<TreeRelation | null>(null)

  if (!person) return null

  const isSelf      = person.id === rootId
  const isGhost     = person.role === "APP_GHOST"
  const isMemorial  = person.role === "APP_MEMO"
  const isPet       = person.role === "APP_PET"

  const userManagesThis = managedIds.includes(person.id)
  const alreadyRequested = requestedIds.includes(person.id)

  // Pets use their dedicated profile editor; human tree members keep using
  // the compact in-tree editor.
  const canEditMember = userManagesThis && (isGhost || isMemorial || isPet || isSelf)
  // Anyone in the tree (except the root) can be removed by a tree-level manager.
  // Ghosts get deleted entirely; real users/memorials are just disconnected.
  const canRemoveMember = canManage && !isSelf
  // Co-management requests apply to ghosts/memorials the user does not yet
  // manage. Requires a session — the action itself already redirects an
  // anonymous requester to sign-in, but every other write control in this
  // sheet already disables itself for anon via its own boolean, and this one
  // hadn't (managedIds/requestedIds are just empty sets for anon, which
  // otherwise leaves this looking identically requestable).
  const canRequestCoManage = (isGhost || isMemorial || isPet) && !userManagesThis && !alreadyRequested && !!sessionUserId

  // Every relation touching this person, for the Relationships list below.
  // Non-REJECTED (not just ACCEPTED) so a manager can also see — and, via the
  // requester carve-out below, withdraw — their own still-pending invites.
  // Pet ownership is stored separately, so this list contains only
  // genealogical relations understood by the generic relation editor.
  const personRelations = relations.filter(
    (r) => (r.fromId === person.id || r.toId === person.id) && r.status !== "REJECTED",
  )
  const petOwners = isPet
    ? petOwnerships
        .filter((ownership) => ownership.petId === person.id)
        .map((ownership) => persons[ownership.ownerId])
        .filter((owner): owner is TreePerson => !!owner)
    : []
  const canEditRelation = (r: TreeRelation) =>
    canManage || (r.status === "PENDING" && r.requestedById === sessionUserId)

  const handleRequestCoManage = () => {
    startRequest(async () => {
      const result = await requestGuardianship({ profileId: person.id })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.coManageRequestSent"))
      router.refresh()
    })
  }

  const label = isPet ? t("relation.pet") : relationFromRoot(persons, relations, rootId, person.id, t)
  // Pets have no lastName (empty string) — avoid a trailing space / bogus
  // second initial for them.
  const fullName = isPet ? person.firstName : `${person.firstName} ${person.lastName}`
  const displayName = person.maidenName
    ? t("nameWithMaiden", { name: fullName, maidenName: person.maidenName })
    : fullName
  const initials = isPet
    ? person.firstName.slice(0, 2).toUpperCase()
    : `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase()

  const events = buildEvents(person, persons, relations, locale)

  const handleRemove = async () => {
    setRemoving(true)
    const result = isPet
      ? await detachPetFromTree(rootId, person.id)
      : await removeMember(rootId, person.id)
    setRemoving(false)
    if (!result.ok) { toast.error(result.message); return }
    toast.success(t("toasts.removedFromTree"))
    onClose()
    onSuccess()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <SheetContent side="right" className="sm:max-w-md w-[min(420px,100vw)] p-0 overflow-y-auto">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-12 w-12 rounded-full overflow-hidden shrink-0 bg-muted flex items-center justify-center ring-2",
                person.gender === "FEMALE" ? "ring-rose-300/70" : person.gender === "MALE" ? "ring-[hsl(var(--brand-indigo)/0.55)]" : "ring-border/50",
              )}>
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt={displayName} className={cn("h-full w-full object-cover", isMemorial && "saturate-50")} />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">{initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className={cn("text-base leading-tight text-left", isGhost && "italic")}>{displayName}</SheetTitle>
                {person.nickname && (
                  <p className="text-xs italic text-muted-foreground mt-0.5">&ldquo;{person.nickname}&rdquo;</p>
                )}
                {isSelf
                  ? <p className="text-xs text-primary mt-1">{t("infoSheet.thisIsYou")}</p>
                  : label && <p className="text-xs text-primary mt-1">{label}</p>}
              </div>
            </div>
          </SheetHeader>

          {/* Edit row */}
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-border/60">
            <p className="text-xs text-muted-foreground leading-snug max-w-[220px]">
              {canEditMember
                ? t("infoSheet.editHint")
                : t("infoSheet.editDisabledHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={isPet ? () => router.push(`/profile/${person.id}/edit`) : onEdit}
              disabled={!canEditMember}
            >
              <SquarePen className="h-3.5 w-3.5" />
              {tc("edit")}
            </Button>
          </div>

          {/* Co-management row — only for ghosts/memorials the user doesn't already manage */}
          {(isGhost || isMemorial || isPet) && !userManagesThis && (
            <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-border/60">
              <p className="text-xs text-muted-foreground leading-snug max-w-[220px]">
                {alreadyRequested
                  ? t("infoSheet.coManageWaiting")
                  : t("infoSheet.coManageHint")}
              </p>
              {alreadyRequested ? (
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled>
                  <Hourglass className="h-3.5 w-3.5" />
                  {t("infoSheet.pending")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handleRequestCoManage}
                  disabled={requesting || !canRequestCoManage}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {t("infoSheet.coManage")}
                </Button>
              )}
            </div>
          )}

          {isPet && petOwners.length > 0 && (
            <div className="px-5 py-4 border-b border-border/60">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                {t("infoSheet.owners")}
              </h3>
              <ul className="space-y-1">
                {petOwners.map((owner) => (
                  <li key={owner.id} className="text-sm">
                    {owner.firstName} {owner.lastName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline */}
          {events.length > 0 && (
            <div className="px-5 py-4 border-b border-border/60">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">{t("infoSheet.timeline")}</h3>
              <ol className="relative space-y-3 pl-1">
                {events.map((e, i) => (
                  <li key={e.id} className="relative flex items-start gap-3">
                    {i < events.length - 1 && (
                      <span aria-hidden className="absolute left-[10px] top-6 bottom-[-12px] w-px bg-border/60" />
                    )}
                    <span className="relative z-10 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/15 text-primary shrink-0">
                      {eventIcon(e.type)}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm leading-tight">{eventLabel(e, t)}</p>
                      {e.date ? (
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{formatDateShort(e.date, locale)}</p>
                      ) : "year" in e && e.year ? (
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{e.year}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Relationships */}
          {personRelations.length > 0 && (
            <div className="px-5 py-4 border-b border-border/60">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">{t("infoSheet.relationships")}</h3>
              <ul className="space-y-1">
                {personRelations.map((r) => {
                  const counterpartId = r.fromId === person.id ? r.toId : r.fromId
                  const counterpart = persons[counterpartId]
                  if (!counterpart) return null
                  const kindKey =
                    r.type === "PARENT_OF" ? (r.fromId === person.id ? "child" : "parent")
                    : r.type === "SPOUSE"  ? "spouse"
                    : "sibling"
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <p className="text-sm truncate min-w-0 flex-1">
                        <span className="text-muted-foreground">{t(`kinds.${kindKey}`)}: </span>
                        {counterpart.firstName} {counterpart.lastName}
                        {r.subtype && (
                          <span className="text-xs text-muted-foreground italic"> ({t(`subtypes.${r.subtype}`)})</span>
                        )}
                        {r.status === "PENDING" && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                            {t("node.pending")}
                          </span>
                        )}
                      </p>
                      {canEditRelation(r) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          onClick={() => setEditingRelation(r)}
                          aria-label={tc("edit")}
                        >
                          <SquarePen className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Quick add relatives */}
          {canManage && !isPet && (
            <div className="px-5 py-4 border-b border-border/60">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{t("infoSheet.addRelative")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => onAddRelative(person.id, "parent")}>{t("infoSheet.addParent")}</Button>
                <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => onAddRelative(person.id, "sibling")}>{t("infoSheet.addSibling")}</Button>
                <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => onAddRelative(person.id, "spouse")}>{t("infoSheet.addPartner")}</Button>
                <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => onAddRelative(person.id, "child")}>{t("infoSheet.addChild")}</Button>
                <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => onAddRelative(person.id, "pet")}>{t("infoSheet.addPet")}</Button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 flex items-center justify-between gap-2">
            {!isGhost ? (
              <Link
                href={`/profile/${person.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {t("infoSheet.seeProfile")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : <span />}
            {canRemoveMember && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={removing}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {tc("remove")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("removeDialog.title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isGhost
                        ? t("removeDialog.ghostDescription", { name: displayName })
                        : isPet
                          ? t("removeDialog.petDescription", { name: displayName })
                        : t("removeDialog.personDescription", { name: displayName })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {tc("remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {editingRelation && (
        <EditRelationDialog
          open={true}
          onClose={() => setEditingRelation(null)}
          rootId={rootId}
          relation={editingRelation}
          onSuccess={() => { setEditingRelation(null); onSuccess() }}
        />
      )}
    </>
  )
}
