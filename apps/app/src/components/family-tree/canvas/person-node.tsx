'use client'

import { useTranslations } from "next-intl"
import { User, BookOpen, GitBranch, Plus, Minus, PawPrint } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TreePerson } from "@/queries/family-tree"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NODE_W, NODE_H } from "./layout"

interface Props {
  person:         TreePerson
  x:              number
  y:              number
  isRoot:         boolean
  isSessionUser:  boolean
  isSelected:     boolean
  /** True for the 2nd+ occurrence of a person reachable via two branches
   *  (pedigree collapse, e.g. a cousin marriage) — renders as a de-emphasized
   *  stub with a hint that this is the same person shown elsewhere. */
  isDuplicate?:   boolean
  /** Whether this occurrence has descendants/ancestors that a collapse
   *  toggle could hide — see computeLayout's LaidNode.hasCollapsible. */
  hasCollapsible?:    boolean
  isCollapsed?:       boolean
  collapseDirection?: "up" | "down"
  onToggleCollapse?:  () => void
  /** True when this occurrence sits on the compare tool's currently
   *  highlighted relationship path (including the two endpoints). */
  isOnPath?:          boolean
  /** 1 or 2 when this occurrence is one of the compare tool's two picks. */
  comparePickIndex?:  1 | 2 | null
  onActivate:     () => void
}

export function PersonNode({
  person, x, y, isRoot, isSessionUser, isSelected, isDuplicate,
  hasCollapsible, isCollapsed, collapseDirection, onToggleCollapse,
  isOnPath, comparePickIndex, onActivate,
}: Props) {
  const t = useTranslations("FamilyTree")
  const isGhost = person.role === "APP_GHOST"
  const isMemorial = person.role === "APP_MEMO"
  const isPet = person.role === "APP_PET"
  const isPending = person.pending && !isRoot

  const ringColor =
    person.gender === "FEMALE"
      ? "ring-rose-300/70"
      : person.gender === "MALE"
        ? "ring-[hsl(var(--brand-indigo)/0.55)]"
        : "ring-border/50"

  // Compare-path highlight: pick 1 = blue, pick 2 = green, everyone else on
  // the path in between = amber. Matches compare-tool.tsx's badge colors.
  const pathColor =
    comparePickIndex === 1 ? "ring-blue-500/70 border-blue-500/40"
      : comparePickIndex === 2 ? "ring-green-500/70 border-green-500/40"
        : "ring-amber-500/70 border-amber-500/40"

  // Pets have no lastName (empty string) — avoid a bogus second initial /
  // trailing space for them.
  const initials = isPet
    ? person.firstName.slice(0, 2).toUpperCase()
    : `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase()
  // Read the always-populated year fields directly (not derived from
  // birthDate/deathDate) so a redacted person still shows a year.
  const birthYear = person.birthYear != null ? String(person.birthYear) : ""
  const deathYear = person.deathYear != null ? String(person.deathYear) : ""
  const yearLabel = deathYear ? `${birthYear || "—"} – ${deathYear}` : birthYear

  const fullName = isPet ? person.firstName : `${person.firstName} ${person.lastName}`
  const displayName = person.maidenName
    ? t("nameWithMaiden", { name: fullName, maidenName: person.maidenName })
    : fullName
  const petSubtitle = [person.petBreed, person.petSpecies].filter(Boolean).join(", ")

  return (
    <div
      data-node={person.id}
      role="button"
      tabIndex={0}
      aria-label={displayName}
      onClick={(e) => { e.stopPropagation(); onActivate() }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        e.stopPropagation()
        onActivate()
      }}
      className={cn(
        "absolute rounded-xl border bg-card/85 backdrop-blur-md flex items-center gap-2.5 px-2.5 pointer-events-auto",
        "transition-[box-shadow,border-color,opacity] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:border-primary/30",
        "cursor-pointer",
        isGhost || isPending ? "border-dashed border-border/70" : "border-white/30",
        isDuplicate && "border-dashed border-border/50 opacity-70",
        isSelected && "ring-2 ring-primary/70 border-primary/30",
        isOnPath && !isSelected && `ring-2 ${pathColor}`,
        isRoot && "scale-[1.04]",
        isPending && "opacity-60",
      )}
      style={{
        left:        x,
        top:         y,
        width:       NODE_W,
        height:      NODE_H,
        boxShadow: isGhost || isPending
          ? undefined
          : "0 4px 14px -6px hsl(230 40% 12% / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.4)",
      }}
    >
      <Avatar className={cn("h-9 w-9 shrink-0 bg-muted ring-2", ringColor)}>
        {person.avatarUrl && (
          <AvatarImage
            src={person.avatarUrl}
            alt={displayName}
            loading="lazy"
            className={cn(isMemorial && "saturate-50")}
          />
        )}
        <AvatarFallback className="text-[10px] font-semibold text-muted-foreground">
          {initials || <User className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className={cn("text-[11.5px] font-semibold leading-tight truncate", (isGhost || isPending) && "italic text-muted-foreground")}>
          {displayName}
        </p>
        {person.nickname && (
          <p className="text-[10px] italic text-muted-foreground/80 leading-tight truncate">
            &ldquo;{person.nickname}&rdquo;
          </p>
        )}
        {isPet && petSubtitle && (
          <p className="text-[10px] text-muted-foreground/80 leading-tight truncate">
            {petSubtitle}
          </p>
        )}
        {yearLabel && (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 tabular-nums leading-tight">
            {yearLabel}
          </p>
        )}
      </div>

      {comparePickIndex && (
        <span
          className={cn(
            "absolute -top-1.5 -left-1.5 z-10 h-4 w-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-sm",
            comparePickIndex === 1 ? "bg-blue-500" : "bg-green-500",
          )}
        >
          {comparePickIndex}
        </span>
      )}

      {hasCollapsible && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.() }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border bg-background flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors z-10",
            collapseDirection === "up" ? "-top-2" : "-bottom-2",
          )}
          aria-label={t(isCollapsed ? "node.expand" : "node.collapse")}
          title={t(isCollapsed ? "node.expand" : "node.collapse")}
        >
          {isCollapsed ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
        </button>
      )}

      {(isSessionUser || isMemorial || isPet || isPending || isDuplicate) && (
        <div className="absolute bottom-1 right-1 flex items-center gap-1">
          {isDuplicate && (
            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-secondary text-foreground/70" title={t("node.duplicateHint")}>
              <GitBranch className="h-2 w-2" />
            </span>
          )}
          {isPending && (
            <span className="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300" title={t("node.awaitingConfirmation")}>
              {t("node.pending")}
            </span>
          )}
          {isMemorial && (
            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-secondary text-foreground/70" title={t("node.memorial")}>
              <BookOpen className="h-2 w-2" />
            </span>
          )}
          {isPet && (
            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-secondary text-foreground/70" title={t("node.pet")}>
              <PawPrint className="h-2 w-2" />
            </span>
          )}
          {isSessionUser && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-full bg-primary text-primary-foreground">
              {t("node.you")}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
