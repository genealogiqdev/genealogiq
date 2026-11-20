'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { Send, SquarePen, Flower, ArrowDownUp, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteTribute } from "@/actions/tribute.actions"
import { formatDateTime } from "@/lib/format-date"
import type { ApprovedTributeRow, UnpublishedTributeRow } from "@/queries/tribute"

const PAGE_SIZE = 10
type SortDir = "newest" | "oldest"

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("")

interface Props {
  items: ApprovedTributeRow[]
  profileId: string
  sessionUserId: string
  canWrite: boolean
  isManager?: boolean
  unpublishedTributes?: UnpublishedTributeRow[]
}

export function TributesClient({ items, profileId, sessionUserId, canWrite, isManager = false, unpublishedTributes }: Props) {
  const t = useTranslations("Tributes")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startDelete] = useTransition()
  const [sort, setSort] = useState<SortDir>("newest")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const listTopRef = useRef<HTMLDivElement | null>(null)
  const didMountRef = useRef(false)

  const handleDelete = (tributeId: string) => {
    setDeletingId(tributeId)
    startDelete(async () => {
      const result = await deleteTribute(tributeId)
      setDeletingId(null)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.refresh()
    })
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) =>
      sort === "newest"
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime(),
    )
  }, [items, sort])

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    setVisibleCount(PAGE_SIZE)
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [sort])

  useEffect(() => {
    if (visibleCount >= sorted.length) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, sorted.length)) },
      { rootMargin: "300px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, sorted.length])

  const visible = sorted.slice(0, visibleCount)
  const writeHref = `/profile/${profileId}/tributes/edit`

  return (
    <>
      <section className="mb-3 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 animate-fade-in">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-muted-foreground italic">
            {t("list.subtitle")}
          </p>
          {canWrite && unpublishedTributes?.map((tribute) => (
            <p key={tribute.id} className="text-xs text-muted-foreground">
              {tribute.status === "PENDING" ? t("list.awaitingModeration") : t("list.rejected")}{" "}
              <Link href={`${writeHref}?tributeId=${encodeURIComponent(tribute.id)}`} className="text-primary hover:underline" aria-label={`${t("list.editYourTribute")}: ${tribute.text}`}>
                {t("list.editPendingLink")} {tribute.text.slice(0, 80)}
              </Link>
            </p>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 self-end lg:self-auto">
          {!items.length ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <ArrowDownUp className="h-4 w-4" />
                  {sort === "newest" ? t("list.newestFirst") : t("list.oldestFirst")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSort("newest")}>{t("list.newestFirst")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort("oldest")}>{t("list.oldestFirst")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canWrite && (
            <Button asChild className="gap-2">
              <Link href={writeHref}>
                <Send className="h-4 w-4" />
                <span>{t("list.sendATribute")}</span>
              </Link>
            </Button>
          )}
        </div>
      </section>

      <div ref={listTopRef} />

      {items.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
          <Flower className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("list.empty")}</p>
          {canWrite && (
            <Button asChild className="gap-2">
              <Link href={writeHref}><Send className="h-4 w-4" />{t("list.sendATribute")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 animate-fade-in" style={{ animationDelay: "80ms" }}>
            {visible.map((tribute) => {
              const isMine = tribute.authorId === sessionUserId
              const authorName = `${tribute.author.firstName} ${tribute.author.lastName}`
              return (
                <article key={tribute.id} className="mb-4 break-inside-avoid glass-card no-sheen overflow-hidden">
                  {tribute.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tribute.imageUrl} alt={t("card.imageAlt", { author: authorName })} loading="lazy" className="w-full h-auto block" />
                  )}
                  <div className="p-5 space-y-4">
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{tribute.text}</p>
                    <div className="flex items-center gap-3 pt-1 border-t border-border/60">
                      <Avatar className="h-8 w-8">
                        {tribute.author.avatarUrl && <AvatarImage src={tribute.author.avatarUrl} alt={authorName} />}
                        <AvatarFallback className="text-xs bg-secondary">{initials(authorName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{authorName}</span>
                          {isMine && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("card.yoursBadge")}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(tribute.createdAt, locale)}</div>
                      </div>
                      {isMine && canWrite && (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("list.editYourTribute")}>
                          <Link href={`${writeHref}?tributeId=${encodeURIComponent(tribute.id)}`}>
                            <SquarePen className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      {(isMine || isManager) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={t("form.deleteTribute")}
                              disabled={deletingId === tribute.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {isMine ? t("card.deleteMineTitle") : t("card.deleteOtherTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("card.deleteDescription")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deletingId === tribute.id}>{tc("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(tribute.id)}
                                disabled={deletingId === tribute.id}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletingId === tribute.id ? tc("deleting") : tc("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {visibleCount < sorted.length ? (
            <div ref={sentinelRef} className="py-10 flex justify-center">
              <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">{t("list.endOfTributes")}</div>
          )}
        </>
      )}
    </>
  )
}
