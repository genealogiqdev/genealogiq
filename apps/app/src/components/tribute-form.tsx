'use client'

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ImagePlus, X, Save, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { submitTribute, deleteTribute } from "@/actions/tribute.actions"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"

const MAX_TEXT = 512

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("")

interface Props {
  profileId: string
  authorName: string
  existing?: { id: string; text: string; imageUrl?: string | null } | null
}

export function TributeForm({ profileId, authorName, existing }: Props) {
  const t = useTranslations("Tributes")
  const tc = useTranslations("Common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!existing

  const [text, setText] = useState(existing?.text ?? "")
  const [imageUrl, setImageUrl] = useState<string | undefined>(existing?.imageUrl ?? undefined)
  const [uploading, setUploading] = useState(false)

  const handleAddImage = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!isAllowedImage(file)) {
      toast.error(t("toasts.unsupportedFile", { formats: IMAGE_FORMATS_LABEL }))
      return
    }
    setUploading(true)
    const preview = URL.createObjectURL(file)
    setImageUrl(preview)
    try {
      const payload = await compressImage(file, { maxDim: 2048 })
      const blob = await upload(`tributes/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/tribute/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify({ profileId }),
      })
      setImageUrl(blob.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.uploadFailed"))
      setImageUrl(existing?.imageUrl ?? undefined)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = () => {
    if (uploading) { toast.warning(t("toasts.waitForUpload")); return }
    startTransition(async () => {
      const result = await submitTribute(profileId, { text, imageUrl })
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success(isEditing ? t("toasts.updated") : t("toasts.submitted"))
        router.push(`/profile/${profileId}/tributes`)
      }
    })
  }

  const handleDelete = () => {
    if (!existing) return
    startTransition(async () => {
      const result = await deleteTribute(existing.id)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.push(`/profile/${profileId}/tributes`)
    })
  }

  return (
    <div className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Author identity */}
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-secondary text-sm font-medium">{initials(authorName)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="text-sm font-medium">{authorName}</div>
        </div>
      </div>

      {/* Image */}
      <div className="space-y-3">
        <FieldLabel className="text-base">{t("form.photoLabel")}</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {imageUrl ? (
            <div className="relative group aspect-square rounded-xl overflow-hidden border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={t("form.previewAlt")} className="h-full w-full object-cover" />
              {uploading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
              {!uploading && (
                <button
                  type="button"
                  onClick={() => setImageUrl(undefined)}
                  className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
                  aria-label={t("form.removeImage")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">{t("form.addImage")}</span>
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { handleAddImage(e.target.files); e.target.value = "" }} />
      </div>

      {/* Text */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="tribute-text" className="text-base" required>{t("form.textLabel")}</FieldLabel>
          <span className="text-xs text-muted-foreground">{text.length}/{MAX_TEXT}</span>
        </div>
        <Textarea
          id="tribute-text"
          value={text}
          maxLength={MAX_TEXT}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("form.textPlaceholder")}
          className="min-h-[200px] text-base leading-relaxed"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sm:gap-3 pt-2 border-t border-border/60">
        {isEditing && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2"><Trash2 className="h-4 w-4" />{t("form.deleteTribute")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("form.deleteDialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("form.deleteDialogDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{tc("delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:ml-auto">
          <Button variant="outline" onClick={() => router.push(`/profile/${profileId}/tributes`)} disabled={isPending}>{tc("cancel")}</Button>
          <Button onClick={handleSubmit} className="gap-2" disabled={isPending || uploading}>
            {isEditing ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isEditing ? tc("save") : t("form.sendTribute")}
          </Button>
        </div>
      </div>
    </div>
  )
}
