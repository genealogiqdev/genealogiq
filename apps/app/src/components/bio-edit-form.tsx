'use client'

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ImagePlus, X, Save, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { uploadMedia as upload } from "@genealogiq/core"
import { saveBio, deleteBio } from "@/actions/bio.actions"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { compressImage } from "@/lib/image-compress"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"
import type { PlanTier } from "@/lib/plan-quotas"
import type { BioRow } from "@/queries/bio"

const MAX_QUOTE = 128

type Aspect = "square" | "portrait" | "landscape"

interface ImageEntry {
  id?: string
  url: string
  aspect: Aspect
  uploading?: boolean
}

interface Props {
  initial: BioRow | null
  profileId: string
  maxChars: number
  // The plan's combined image pool max (shared with Gallery/Geolocalizações),
  // not a bio-only number.
  maxImages: number
  // How many of that pool are already used by OTHER modules (Gallery +
  // Geolocalizações) — subtracted from maxImages to get what's actually left
  // for this bio specifically.
  otherImagesUsed: number
  tier: PlanTier
}

export function BioEditForm({ initial, profileId, maxChars, maxImages, otherImagesUsed, tier }: Props) {
  const t = useTranslations("Bio")
  const tc = useTranslations("Common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isCreating = !initial
  const effectiveMaxImages = Math.max(0, maxImages - otherImagesUsed)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)

  const [quote, setQuote] = useState(initial?.quote ?? "")
  const [text, setText] = useState(initial?.text ?? "")
  const [images, setImages] = useState<ImageEntry[]>(
    initial?.images.map((img) => ({
      id: img.id,
      url: img.url,
      aspect: (img.aspect as Aspect) ?? "square",
    })) ?? [],
  )

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const all = Array.from(files)
    const valid = all.filter(isAllowedImage)
    if (valid.length < all.length) {
      toast.warning(t("toastFilesSkipped", { count: all.length - valid.length, formats: IMAGE_FORMATS_LABEL }))
    }
    if (valid.length === 0) return
    const remaining = effectiveMaxImages - images.length
    if (remaining <= 0) {
      setLimitDialogOpen(true)
      return
    }
    const upgradeAction = { label: t("upgradePlan"), onClick: () => router.push("/subscriptions") }
    const toProcess = valid.slice(0, remaining)
    if (valid.length > remaining) {
      toast.warning(t("toastLimitedAdded", { count: remaining, max: effectiveMaxImages }), { action: upgradeAction })
    }

    const placeholders: ImageEntry[] = toProcess.map((f) => ({
      url: URL.createObjectURL(f),
      aspect: "square",
      uploading: true,
    }))
    setImages((prev) => [...prev, ...placeholders])

    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      try {
        const payload = await compressImage(file, { maxDim: 2048 })
        const blob = await upload(`bio/${payload.name}`, payload, {
          access: "public",
          handleUploadUrl: "/api/bio/upload",
          contentType: payload.type,
          clientPayload: JSON.stringify({ profileId }),
        })
        setImages((prev) => {
          const next = [...prev]
          const idx = next.findIndex((img) => img.uploading && img.url === placeholders[i].url)
          if (idx !== -1) next[idx] = { url: blob.url, aspect: "square" }
          return next
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toastUploadFailed", { name: file.name }))
        setImages((prev) => prev.filter((img) => img.url !== placeholders[i].url))
      }
    }
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    if (images.some((img) => img.uploading)) {
      toast.warning(t("toastWaitUploads"))
      return
    }
    startTransition(async () => {
      const result = await saveBio(profileId, {
        quote: quote || undefined,
        text: text || undefined,
        images: images.map((img, i) => ({
          id: img.id,
          url: img.url,
          aspect: img.aspect,
          order: i,
        })),
      })
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success(t("toastSaved"))
        router.push(`/profile/${profileId}/bio`)
      }
    })
  }

  const handleReset = () => {
    setQuote(initial?.quote ?? "")
    setText(initial?.text ?? "")
    setImages(
      initial?.images.map((img) => ({
        id: img.id,
        url: img.url,
        aspect: (img.aspect as Aspect) ?? "square",
      })) ?? [],
    )
    toast(t("toastReset"))
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteBio(profileId)
      toast.success(t("toastDeleted"))
      router.push(`/profile/${profileId}/bio`)
    })
  }

  return (
    <div className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Images */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("photos")}</Label>
          <span className="text-xs text-muted-foreground">{images.length}/{effectiveMaxImages}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={t("previewAlt")} className="h-full w-full object-cover" />
              {img.uploading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
                  aria-label={t("removeImage")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {images.length < effectiveMaxImages && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">{t("addImage")}</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            handleAddImages(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {/* Quote */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bio-quote" className="text-base">{t("quoteLabel")}</Label>
          <span className="text-xs text-muted-foreground">{quote.length}/{MAX_QUOTE}</span>
        </div>
        <Input
          id="bio-quote"
          value={quote}
          maxLength={MAX_QUOTE}
          onChange={(e) => setQuote(e.target.value)}
          placeholder={t("quotePlaceholder")}
        />
      </div>

      {/* Bio text */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bio-text" className="text-base">{t("textLabel")}</Label>
          <span className="text-xs text-muted-foreground">{text.length}/{maxChars}</span>
        </div>
        <Textarea
          id="bio-text"
          value={text}
          maxLength={maxChars}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("textPlaceholder")}
          className="min-h-[260px] text-base leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">{t("paragraphHint")}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button onClick={handleSave} className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending}>
            <Save className="h-4 w-4" />
            {tc("save")}
          </Button>
          {!isCreating && (
            <Button variant="outline" onClick={handleReset} className="gap-2 w-full md:w-auto order-2 md:order-1" disabled={isPending}>
              <RotateCcw className="h-4 w-4" />
              {t("reset")}
            </Button>
          )}
        </div>
        {!isCreating && (
          <div className="order-2 md:order-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2 w-full md:w-auto">
                  <Trash2 className="h-4 w-4" />
                  {t("deleteBio")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteDialogDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {tc("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <LimitReachedDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        context="media-images"
        limit={maxImages}
        tier={tier}
      />
    </div>
  )
}
