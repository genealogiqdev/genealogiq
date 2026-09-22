'use client'

import { useState, useTransition, useRef } from "react"
import { useTranslations } from "next-intl"
import { Search, User, UserPlus, ArrowLeft, Globe, ExternalLink, PawPrint } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { addRelation, addGhostRelative } from "@/actions/family-tree.actions"
import { attachPet, createPet } from "@/actions/pet.actions"
import { SPOUSE_SUBTYPES, type SpouseSubtype } from "@/schemas/family-tree.schema"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"
import type { PlanTier } from "@/lib/plan-quotas"
import type { WikiTreeSearchResult, WikiTreeProfile } from "@/lib/wikitree"
import { mapWikiTreeProfileToGhostPrefill, wikiTreeSearchResultYears } from "@/lib/wikitree-mapper"

type RelationKind = "parent" | "spouse" | "sibling" | "child" | "pet"
type Mode = "search" | "create" | "createPet" | "wikitree"

interface SearchResult {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  gender: string | null
  role: string
  deathDate: string | null
  petSpecies: string | null
  petBreed: string | null
}

interface ExistingParent {
  id:   string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  anchorId: string
  rootId: string
  initialKind?: RelationKind
  /** Existing parents of the anchor — used to offer the "Married to X" checkbox when adding a 2nd parent. */
  anchorParents?: ExistingParent[]
  onSuccess?: () => void
  memberCount: number
  memberLimit: number
  petCount: number
  petLimit: number
  petAtLimit: boolean
  tier: PlanTier
}

const KIND_ORDER: RelationKind[] = ["parent", "spouse", "sibling", "child", "pet"]

const KIND_TO_TYPE: Record<Exclude<RelationKind, "pet">, "PARENT_OF" | "SPOUSE" | "SIBLING"> = {
  parent: "PARENT_OF", child: "PARENT_OF", spouse: "SPOUSE", sibling: "SIBLING",
}

function genderRingClass(gender: string | null) {
  if (gender === "FEMALE") return "ring-rose-400/50"
  if (gender === "MALE")   return "ring-[hsl(var(--brand-indigo)/0.5)]"
  return "ring-border/40"
}

export function AddRelativeDialog({
  open,
  onClose,
  anchorId,
  rootId,
  initialKind = "parent",
  anchorParents = [],
  onSuccess,
  memberCount,
  memberLimit,
  petCount,
  petLimit,
  petAtLimit,
  tier,
}: Props) {
  const t = useTranslations("FamilyTree")
  const tc = useTranslations("Common")
  const [isPending, startTransition] = useTransition()
  const [limitContext, setLimitContext] = useState<"tree" | "pets" | null>(null)
  const [mode, setMode]   = useState<Mode>("search")
  const [kind, setKind]   = useState<RelationKind>(initialKind)
  const [spouseSubtype, setSpouseSubtype] = useState<SpouseSubtype>("married")
  const [marriedAt, setMarriedAt] = useState("")
  const [endedAt, setEndedAt] = useState("")
  const [linkSpouse, setLinkSpouse] = useState(true)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ghost form
  const [firstName, setFirstName]   = useState("")
  const [lastName,  setLastName]    = useState("")
  const [maidenName, setMaidenName] = useState("")
  const [nickname, setNickname]     = useState("")
  const [gender,    setGender]      = useState<"MALE" | "FEMALE" | "OTHER" | "">("")
  const [birthDate, setBirthDate]   = useState("")
  const [deathDate, setDeathDate]   = useState("")
  const [birthPlace, setBirthPlace] = useState("")
  const [deathPlace, setDeathPlace] = useState("")
  const [wikiTreeSource, setWikiTreeSource] = useState<string | null>(null)
  const [petName, setPetName] = useState("")
  const [petSpecies, setPetSpecies] = useState("")
  const [petBreed, setPetBreed] = useState("")

  // WikiTree search
  const [wikitreeQuery, setWikitreeQuery]     = useState("")
  const [wikitreeResults, setWikitreeResults] = useState<WikiTreeSearchResult[]>([])
  const [wikitreeLoading, setWikitreeLoading] = useState(false)
  const [wikitreeError, setWikitreeError]     = useState(false)
  const [wikitreeProfileLoading, setWikitreeProfileLoading] = useState<string | null>(null)
  const wikitreeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = (value: string) => {
    setQuery(value)
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const mode = kind === "pet" ? "pet" : "relative"
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&mode=${mode}`)
        const data = await res.json() as SearchResult[]
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleWikitreeSearch = (value: string) => {
    setWikitreeQuery(value)
    setWikitreeError(false)
    if (wikitreeDebounceRef.current) clearTimeout(wikitreeDebounceRef.current)
    if (!value.trim()) { setWikitreeResults([]); return }
    wikitreeDebounceRef.current = setTimeout(async () => {
      setWikitreeLoading(true)
      try {
        const res = await fetch(`/api/wikitree/search?q=${encodeURIComponent(value)}`)
        if (!res.ok) { setWikitreeResults([]); setWikitreeError(true); return }
        const data = await res.json() as WikiTreeSearchResult[]
        setWikitreeResults(data)
      } catch {
        setWikitreeResults([])
        setWikitreeError(true)
      } finally {
        setWikitreeLoading(false)
      }
    }, 300)
  }

  const handleSelectWikitreeResult = (result: WikiTreeSearchResult) => {
    setWikitreeProfileLoading(result.id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/wikitree/profile?id=${encodeURIComponent(result.id)}`)
        if (!res.ok) { toast.error(t("addRelative.wikitree.profileFetchFailed")); return }
        const profile = await res.json() as WikiTreeProfile
        const prefill = mapWikiTreeProfileToGhostPrefill(profile)
        setFirstName(prefill.firstName)
        setLastName(prefill.lastName)
        setMaidenName(prefill.maidenName ?? "")
        setGender(prefill.gender ?? "")
        setBirthDate(prefill.birthDate ?? "")
        setDeathDate(prefill.deathDate ?? "")
        setBirthPlace(prefill.birthPlace ?? "")
        setDeathPlace(prefill.deathPlace ?? "")
        setWikiTreeSource(prefill.sourceUrl)
        setMode("create")
      } catch {
        toast.error(t("addRelative.wikitree.profileFetchFailed"))
      } finally {
        setWikitreeProfileLoading(null)
      }
    })
  }

  const handleConfirmExisting = () => {
    if (!selected) return
    startTransition(async () => {
      if (kind === "pet") {
        const result = await attachPet(rootId, selected.id, anchorId)
        if (!result.ok) { toast.error(result.message); return }
        toast.success(t("toasts.petAdded"))
        handleClose()
        onSuccess?.()
        return
      }
      let fromId: string, toId: string
      const type = KIND_TO_TYPE[kind]
      if (kind === "parent")      { fromId = selected.id; toId = anchorId }
      else if (kind === "child")  { fromId = anchorId;    toId = selected.id }
      else                        { fromId = anchorId;    toId = selected.id }

      const result = await addRelation(rootId, {
        fromId, toId, type,
        subtype:   kind === "spouse" ? spouseSubtype : null,
        startDate: kind === "spouse" && marriedAt ? marriedAt : null,
        endDate:   kind === "spouse" && needsEndDate && endedAt ? endedAt : null,
        linkSpouseId: shouldLinkSpouse ? anchorParents[0]?.id : null,
      })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.relativeAdded"))
      handleClose()
      onSuccess?.()
    })
  }

  const handleConfirmGhost = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("toasts.nameRequired"))
      return
    }
    // A new ghost is always a brand-new node — unlike linking to an existing
    // person (handleConfirmExisting), which may or may not grow the tree
    // depending on server-side involvesNew logic this doesn't try to mirror.
    if (memberCount >= memberLimit) {
      setLimitContext("tree")
      return
    }
    startTransition(async () => {
      const result = await addGhostRelative(rootId, {
        firstName, lastName,
        maidenName: maidenName || null,
        nickname:   nickname   || null,
        gender:     gender || null,
        birthDate:  birthDate || null,
        deathDate:  deathDate || null,
        birthPlace: birthPlace || null,
        deathPlace: deathPlace || null,
        anchorId, kind,
        subtype:   kind === "spouse" ? spouseSubtype : null,
        startDate: kind === "spouse" && marriedAt ? marriedAt : null,
        endDate:   kind === "spouse" && needsEndDate && endedAt ? endedAt : null,
        linkSpouseId: shouldLinkSpouse ? anchorParents[0]?.id : null,
      })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.personAdded"))
      handleClose()
      onSuccess?.()
    })
  }

  const handleConfirmPet = () => {
    if (!petName.trim()) {
      toast.error(t("toasts.petNameRequired"))
      return
    }
    if (petAtLimit) {
      setLimitContext("pets")
      return
    }
    startTransition(async () => {
      const result = await createPet({
        firstName: petName,
        species: petSpecies || null,
        breed: petBreed || null,
        gender: null,
        birthDate: null,
        deathDate: null,
        avatarUrl: null,
        ownerIds: [anchorId],
      }, rootId)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.petAdded"))
      handleClose()
      onSuccess?.()
    })
  }

  const handleClose = () => {
    onClose()
    setMode("search")
    setQuery(""); setResults([]); setSelected(null)
    setKind(initialKind)
    setSpouseSubtype("married")
    setMarriedAt("")
    setEndedAt("")
    setLinkSpouse(true)
    setFirstName(""); setLastName(""); setMaidenName("")
    setNickname("")
    setGender(""); setBirthDate(""); setDeathDate("")
    setBirthPlace(""); setDeathPlace(""); setWikiTreeSource(null)
    setWikitreeQuery(""); setWikitreeResults([]); setWikitreeError(false)
    setPetName(""); setPetSpecies(""); setPetBreed("")
  }

  const handleKindChange = (value: string) => {
    setKind(value as RelationKind)
    setMode("search")
    setQuery("")
    setResults([])
    setSelected(null)
  }

  const showNoResults = !loading && results.length === 0 && query.length >= 3
  const showSpouseLink = kind === "parent" && anchorParents.length > 0
  const shouldLinkSpouse = showSpouseLink && linkSpouse
  const needsEndDate = spouseSubtype === "divorced" || spouseSubtype === "widowed"
  const startLabel = spouseSubtype === "partner" ? t("addRelative.togetherSince") : t("addRelative.married")
  const endLabel   = spouseSubtype === "widowed" ? t("addRelative.widowed") : t("addRelative.divorced")

  return (
    <>
    {/* Hidden (not unmounted) while the limit dialog shows on top of it, so
        typed ghost-form state survives a dismiss instead of resetting. */}
    <Dialog open={open && !limitContext} onOpenChange={(v) => { if (!v && !limitContext) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === "create" || mode === "createPet" ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("search")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("addRelative.backToSearch")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {mode === "createPet" ? t("addRelative.newPetTitle") : t("addRelative.newPersonTitle")}
              </span>
            ) : mode === "wikitree" ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("search")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("addRelative.backToSearch")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {t("addRelative.wikitree.title")}
              </span>
            ) : t("addRelative.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className={cn("gap-2 items-end", mode === "search" ? "flex" : "grid grid-cols-2")}>
            <div className="space-y-1.5 shrink-0">
              <FieldLabel>{t("addRelative.kindLabel")}</FieldLabel>
              <Select value={kind} onValueChange={handleKindChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{t(`kinds.${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "search" ? (
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 w-full"
                  placeholder={kind === "pet" ? t("addRelative.petSearchPlaceholder") : t("addRelative.searchPlaceholder")}
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            ) : kind === "spouse" && (
              <div className="space-y-1.5">
                <FieldLabel>{t("addRelative.typeLabel")}</FieldLabel>
                <Select value={spouseSubtype} onValueChange={(v) => setSpouseSubtype(v as SpouseSubtype)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPOUSE_SUBTYPES.map((s) => (
                      <SelectItem key={s} value={s}>{t(`subtypes.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {mode === "search" && kind === "spouse" && (
            <div className="space-y-1.5">
              <FieldLabel>{t("addRelative.typeLabel")}</FieldLabel>
              <Select value={spouseSubtype} onValueChange={(v) => setSpouseSubtype(v as SpouseSubtype)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPOUSE_SUBTYPES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`subtypes.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "spouse" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="rel-start">{startLabel}:</FieldLabel>
                <Input id="rel-start" type="date" value={marriedAt} onChange={(e) => setMarriedAt(e.target.value)} />
              </div>
              {needsEndDate && (
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="rel-end">{endLabel}:</FieldLabel>
                  <Input id="rel-end" type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {showSpouseLink && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox checked={linkSpouse} onCheckedChange={(v) => setLinkSpouse(v === true)} />
              <span>
                {t.rich("addRelative.marriedTo", {
                  name: anchorParents[0].name,
                  strong: (chunks) => <span className="font-medium">{chunks}</span>,
                })}
              </span>
            </label>
          )}

          {mode === "search" ? (
            <div className="space-y-2">
              {(results.length > 0 || loading) && (
                <div className="border border-border/60 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                  {loading ? (
                    <div className="py-6 flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    results.map((r) => {
                      const isPetResult = r.role === "APP_PET"
                      const name = r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName
                      const isSelected = selected?.id === r.id
                      const isMemorialized = r.role === "APP_MEMO"
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelected(r)}
                          className={cn("w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent/60 transition-colors", isSelected && "bg-accent")}
                        >
                          <div className={cn("h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden ring-2", genderRingClass(r.gender))}>
                            {r.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.avatarUrl} alt={name} className={cn("h-full w-full object-cover", isMemorialized && "saturate-50")} />
                            ) : (
                              isPetResult
                                ? <PawPrint className="h-4 w-4 text-muted-foreground" />
                                : <User className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{name}</p>
                            {isMemorialized && <p className="text-[10px] text-muted-foreground italic">{t("memorialized")}</p>}
                            {isPetResult && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {[r.petBreed, r.petSpecies].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {showNoResults && <p className="text-sm text-center text-muted-foreground py-2">{t("addRelative.noResults")}</p>}

              {kind === "pet" ? (
                <>
                  <p className="text-xs text-muted-foreground pt-2">
                    {t("addRelative.petQuota", { count: petCount, limit: petLimit })}
                  </p>
                  <button
                    type="button"
                    onClick={() => petAtLimit ? setLimitContext("pets") : setMode("createPet")}
                    className="w-full inline-flex items-center justify-start gap-2 text-sm font-medium text-primary hover:underline pt-1"
                  >
                    <PawPrint className="h-4 w-4 shrink-0" />
                    {t("addRelative.addNewPet")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMode("wikitree")}
                    className="w-full inline-flex items-center justify-start gap-2 text-sm font-medium text-primary hover:underline pt-4"
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    {t("addRelative.searchWikiTree")}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setWikiTreeSource(null); setMode("create") }}
                    className="w-full inline-flex items-start justify-start gap-2 text-sm font-medium text-primary hover:underline pt-1"
                  >
                    <UserPlus className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-left">
                      <span className="block">{t("addRelative.addNewPersonQuestion")}</span>
                      <span className="block">{t("addRelative.addNewPersonAction")}</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          ) : mode === "wikitree" ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("addRelative.wikitree.placeholder")}
                  value={wikitreeQuery}
                  onChange={(e) => handleWikitreeSearch(e.target.value)}
                />
              </div>

              {(wikitreeResults.length > 0 || wikitreeLoading) && (
                <div className="border border-border/60 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                  {wikitreeLoading ? (
                    <div className="py-6 flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    wikitreeResults.map((r) => {
                      const lastName = r.lastNameCurrent || r.lastNameAtBirth
                      const name = `${r.firstName} ${lastName}`.trim()
                      const { birthYear, deathYear } = wikiTreeSearchResultYears(r)
                      const years = [birthYear, deathYear].filter((y): y is number => y !== null).join(" – ")
                      const isLoadingProfile = wikitreeProfileLoading === r.id
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={isLoadingProfile}
                          onClick={() => handleSelectWikitreeResult(r)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent/60 transition-colors disabled:opacity-60"
                        >
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border/40">
                            {isLoadingProfile ? (
                              <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            ) : (
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[years, r.birthLocation].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {wikitreeError && (
                <p className="text-sm text-center text-muted-foreground py-2">
                  {t("addRelative.wikitree.unavailable")}{" "}
                  <button
                    type="button"
                    onClick={() => { setWikiTreeSource(null); setMode("create") }}
                    className="text-primary hover:underline font-medium"
                  >
                    {t("addRelative.wikitree.tryManual")}
                  </button>
                </p>
              )}

              {!wikitreeError && !wikitreeLoading && wikitreeResults.length === 0 && wikitreeQuery.length >= 3 && (
                <p className="text-sm text-center text-muted-foreground py-2">{t("addRelative.wikitree.noResults")}</p>
              )}
            </div>
          ) : mode === "createPet" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="pet-name" required>{t("addRelative.petFields.name")}</FieldLabel>
                <Input id="pet-name" value={petName} onChange={(e) => setPetName(e.target.value)} maxLength={64} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pet-species">{t("addRelative.petFields.species")}</FieldLabel>
                  <Input id="pet-species" value={petSpecies} onChange={(e) => setPetSpecies(e.target.value)} maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pet-breed">{t("addRelative.petFields.breed")}</FieldLabel>
                  <Input id="pet-breed" value={petBreed} onChange={(e) => setPetBreed(e.target.value)} maxLength={60} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("addRelative.petHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wikiTreeSource && (
                <p className="text-xs text-muted-foreground">
                  {t("addRelative.wikitree.sourceLabel")}{" — "}
                  <a
                    href={wikiTreeSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t("addRelative.wikitree.viewSource")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-first" required>{t("fields.firstName")}</FieldLabel>
                  <Input id="g-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={64} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-last" required>{t("fields.lastName")}</FieldLabel>
                  <Input id="g-last" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={64} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-maiden">{t("fields.maidenName")}</FieldLabel>
                  <Input id="g-maiden" value={maidenName} onChange={(e) => setMaidenName(e.target.value)} maxLength={64} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-nick">{t("fields.nickname")}</FieldLabel>
                  <Input id="g-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>{t("fields.gender")}</FieldLabel>
                <Select value={gender} onValueChange={(v) => setGender(v as "MALE" | "FEMALE" | "OTHER")}>
                  <SelectTrigger><SelectValue placeholder={t("fields.genderSelect")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FEMALE">{t("gender.female")}</SelectItem>
                    <SelectItem value="MALE">{t("gender.male")}</SelectItem>
                    <SelectItem value="OTHER">{t("gender.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-birth">{t("fields.birthDate")}</FieldLabel>
                  <Input id="g-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-death">{t("fields.deathDate")}</FieldLabel>
                  <Input id="g-death" type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-birthplace">{t("fields.birthPlace")}</FieldLabel>
                  <Input id="g-birthplace" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="g-deathplace">{t("fields.deathPlace")}</FieldLabel>
                  <Input id="g-deathplace" value={deathPlace} onChange={(e) => setDeathPlace(e.target.value)} maxLength={100} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("addRelative.ghostHint")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>{tc("cancel")}</Button>
          {mode === "search" ? (
            <Button onClick={handleConfirmExisting} disabled={!selected || isPending}>{tc("add")}</Button>
          ) : mode === "create" ? (
            <Button onClick={handleConfirmGhost} disabled={isPending}>
              {isPending ? tc("saving") : t("addRelative.addToTree")}
            </Button>
          ) : mode === "createPet" ? (
            <Button onClick={handleConfirmPet} disabled={isPending}>
              {isPending ? tc("saving") : t("addRelative.addPetToTree")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <LimitReachedDialog
      open={limitContext !== null}
      onOpenChange={(isOpen) => { if (!isOpen) setLimitContext(null) }}
      context={limitContext ?? "tree"}
      limit={limitContext === "pets" ? petLimit : memberLimit}
      tier={tier}
    />
    </>
  )
}
