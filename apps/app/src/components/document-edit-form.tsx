"use client"

import { useRef, useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileUp, FileText, X, Save, RotateCcw, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { saveDocument, deleteDocument } from "@/actions/documents.actions"
import { getDocumentSchema, type DocumentFormValues } from "@/schemas/document.schema"
import { DOCUMENT_CATEGORIES } from "@/consts/document-categories"
import type { DocumentRow } from "@/queries/documents"

// Some Windows browsers send an empty MIME for certain formats — fall back to
// the extension, mirroring lib/upload-validation.ts's image/video helpers.
function isAllowedPdf(file: File): boolean {
  if (file.type === "application/pdf") return true
  return file.name.toLowerCase().endsWith(".pdf")
}

function buildDefaults(existing: DocumentRow | null): DocumentFormValues {
  return {
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    category: existing?.category ?? "",
    fileUrl: existing?.fileUrl ?? "",
    fileName: existing?.fileName ?? "",
    isPublic: existing?.isPublic ?? true,
  }
}

interface Props {
  profileId: string
  existing: DocumentRow | null
}

export function DocumentEditForm({ profileId, existing }: Props) {
  const router = useRouter()
  const t = useTranslations("Documents")
  const tc = useTranslations("Common")
  const tErr = useTranslations("Errors")
  const [isPending, startTransition] = useTransition()
  const isEditing = !!existing
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const {
    control,
    setValue,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DocumentFormValues>({
    resolver: useMemo(() => zodResolver(getDocumentSchema(tErr)), [tErr]),
    defaultValues: buildDefaults(existing),
  })

  const fileUrl = useWatch({ control, name: "fileUrl" }) ?? ""
  const fileName = useWatch({ control, name: "fileName" }) ?? ""
  const descriptionValue = useWatch({ control, name: "description" }) ?? ""

  const handleUploadFile = async (file: File | null) => {
    if (!file) return
    if (!isAllowedPdf(file)) {
      toast.error(t("toasts.unsupportedFile"))
      return
    }
    setUploading(true)
    try {
      const blob = await upload(`documents/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/documents/upload",
        contentType: file.type || "application/pdf",
        clientPayload: JSON.stringify({ profileId }),
      })
      setValue("fileUrl", blob.url, { shouldDirty: true })
      setValue("fileName", file.name, { shouldDirty: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.uploadFailed"))
    } finally {
      setUploading(false)
    }
  }

  const removeFile = () => {
    setValue("fileUrl", "", { shouldDirty: true })
    setValue("fileName", "", { shouldDirty: true })
  }

  const onSubmit = (data: DocumentFormValues) => {
    if (uploading) { toast.warning(t("toasts.waitForUpload")); return }
    startTransition(async () => {
      const result = await saveDocument(profileId, existing?.id ?? null, data)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.saved"))
      router.push(`/profile/${profileId}/documents`)
    })
  }

  const handleReset = () => {
    reset(buildDefaults(existing))
    toast(t("toasts.reset"))
  }

  const handleDelete = () => {
    if (!existing) return
    startTransition(async () => {
      const result = await deleteDocument(profileId, existing.id)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.push(`/profile/${profileId}/documents`)
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => toast.error(t("toasts.fixFields")))}
      className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in"
      style={{ animationDelay: "80ms" }}
    >
      {/* File */}
      <div className="space-y-2">
        <Label className="text-base">{t("fileLabel")}</Label>
        {fileUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="truncate text-sm">{fileName || t("fileLabel")}</span>
            </div>
            <button
              type="button"
              onClick={removeFile}
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition"
              aria-label={t("fileRemove")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground py-8 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
            <span className="text-xs font-medium">{uploading ? t("fileUploading") : t("fileUpload")}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { handleUploadFile(e.target.files?.[0] ?? null); e.target.value = "" }}
        />
        {errors.fileUrl && <p className="text-xs text-destructive">{errors.fileUrl.message}</p>}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="document-title" className="text-base">{t("titleLabel")}</Label>
        <Input id="document-title" maxLength={120} placeholder={t("titlePlaceholder")} {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="document-category" className="text-base">{t("categoryLabel")}</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="document-category"><SelectValue placeholder={t("categoryPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`cat_${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="document-description" className="text-base">{t("descriptionLabel")}</Label>
          <span className="text-xs text-muted-foreground">{descriptionValue.length}/2000</span>
        </div>
        <Textarea
          id="document-description"
          maxLength={2000}
          placeholder={t("descriptionPlaceholder")}
          className="min-h-[140px] text-base leading-relaxed"
          {...register("description")}
        />
      </div>

      {/* Visibility */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="document-public" className="text-base">{t("publicToggleLabel")}</Label>
          <p className="text-xs text-muted-foreground">{t("publicToggleHint")}</p>
        </div>
        <Controller
          control={control}
          name="isPublic"
          render={({ field }) => (
            <Switch id="document-public" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button type="submit" className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending || uploading}>
            <Save className="h-4 w-4" />{tc("save")}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="gap-2 w-full md:w-auto order-2 md:order-1" disabled={isPending}>
            <RotateCcw className="h-4 w-4" />{t("reset")}
          </Button>
        </div>
        {isEditing && (
          <div className="order-2 md:order-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" className="gap-2 w-full md:w-auto" disabled={isPending}>
                  <Trash2 className="h-4 w-4" />{t("deleteDocument")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteDialogDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{tc("delete")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </form>
  )
}
