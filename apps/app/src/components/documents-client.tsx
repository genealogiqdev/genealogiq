"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations, useLocale } from "next-intl"
import { FileText, FilePlus, Lock, CalendarDays, Pencil, ExternalLink, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignupDialog } from "@/components/auth/signup-dialog"
import { QuotaGatedLink } from "@/components/quota-gated-link"
import { formatDateTime } from "@/lib/format-date"
import type { PlanTier } from "@/lib/plan-quotas"
import type { DocumentRow } from "@/queries/documents"

interface Props {
  documents: DocumentRow[]
  profileId: string
  isOwn: boolean
  // Anonymous visitors: the truncated rows are still visible (title/description/
  // category), but clicking ANY of them — or the fake "load more" button — opens
  // the sign-up dialog instead of the detail/download dialog.
  gated?: boolean
  hasMore?: boolean
  atLimit?: boolean
  documentsMax?: number
  tier?: PlanTier
}

export function DocumentsClient({
  documents,
  profileId,
  isOwn,
  gated = false,
  hasMore = false,
  atLimit = false,
  documentsMax = 0,
  tier = "FREE",
}: Props) {
  const t = useTranslations("Documents")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const [active, setActive] = useState<DocumentRow | null>(null)
  const [wallOpen, setWallOpen] = useState(false)

  if (documents.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{t("emptyTitle")}</p>
        {isOwn && (
          <QuotaGatedLink
            href={`/profile/${profileId}/documents/new`}
            atLimit={atLimit}
            limitContext="documents"
            limit={documentsMax}
            tier={tier}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <FilePlus className="h-4 w-4" />{t("addDocument")}
          </QuotaGatedLink>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {documents.map((doc, i) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => (gated ? setWallOpen(true) : setActive(doc))}
            className="glass-card group w-full text-left flex items-start gap-4 p-4 md:p-5 animate-fade-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="shrink-0 h-14 w-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/60">
              <FileText className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold tracking-tight line-clamp-1">{doc.title}</h3>
              {doc.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{doc.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary" className="text-[10px]">{t(`cat_${doc.category}`)}</Badge>
                {isOwn && !doc.isPublic && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Lock className="h-2.5 w-2.5" />{t("privateLabel")}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />{t("dateLabel")} {formatDateTime(doc.createdAt, locale)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {gated && hasMore && (
        <div className="py-10 flex justify-center">
          <Button variant="outline" className="gap-2" onClick={() => setWallOpen(true)}>
            <FileText className="h-4 w-4" />
            {t("loadMore")}
          </Button>
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{active.title}</DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{t(`cat_${active.category}`)}</Badge>
                {isOwn && !active.isPublic && (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" />{t("privateLabel")}
                  </Badge>
                )}
              </div>

              {active.description && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{active.description}</p>
              )}

              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />{t("dateLabel")} {formatDateTime(active.createdAt, locale)}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                {active.fileUrl ? (
                  <>
                    <Button asChild size="sm" className="gap-1.5">
                      <a href={`/api/documents/${encodeURIComponent(active.id)}/file`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />{t("viewPdf")}
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={`/api/documents/${encodeURIComponent(active.id)}/file`} download={active.fileName ?? active.title} rel="noopener noreferrer">
                        <Download className="h-4 w-4" />{t("downloadPdf")}
                      </a>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noFile")}</p>
                )}
                {isOwn && (
                  <Button asChild variant="ghost" size="sm" className="gap-1.5">
                    <Link href={`/profile/${profileId}/documents/${active.id}/edit`}>
                      <Pencil className="h-4 w-4" />{tc("edit")}
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {gated && <SignupDialog open={wallOpen} onOpenChange={setWallOpen} dismissible />}
    </>
  )
}
