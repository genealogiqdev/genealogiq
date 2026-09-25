'use client'

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ImagePlus, Film, X, Save, RotateCcw, Trash2 } from "lucide-react"
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
import { saveGallery, deleteGallery } from "@/actions/gallery.actions"
import {
  isAllowedImage,
  isAllowedVideo,
  IMAGE_FORMATS_LABEL,
  VIDEO_FORMATS_LABEL,
} from "@/lib/upload-validation"
import { compressImage } from "@/lib/image-compress"
import { inspectVideo, needsTranscode, transcodeToHD } from "@/lib/video-transcode"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"
import type { PlanTier } from "@/lib/plan-quotas"
import type { GalleryItemRow } from "@/queries/gallery"

const MAX_VIDEO_SECONDS = 300

type MediaKind = "image" | "video"

interface MediaEntry {
  id?: string
  kind: MediaKind
  url: string
  poster?: string
  durationSec?: number
  takenAt?: string
  location?: string
  description?: string
  uploading?: boolean
  transcoding?: boolean
  transcodeProgress?: number
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function MetaFields({ item, onChange }: { item: MediaEntry; idx: number; onChange: (patch: Partial<MediaEntry>) => void }) {
  const t = useTranslations("Gallery")
  return (
    <div className="p-3 space-y-2 border-t border-border/60 bg-card/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("dateTaken")}</Label>
          <Input type="date" value={item.takenAt ?? ""} onChange={(e) => onChange({ takenAt: e.target.value })} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("location")}</Label>
          <Input type="text" placeholder={t("locationPlaceholder")} value={item.location ?? ""} onChange={(e) => onChange({ location: e.target.value })} className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("description")}</Label>
        <Textarea rows={2} maxLength={280} placeholder={t("descriptionPlaceholder")} value={item.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} className="min-h-[56px] text-sm resize-none" />
      </div>
    </div>
  )
}

interface Props {
  initial: GalleryItemRow[]
  profileId: string
  // The plan's combined image pool max (shared with Bio/Geolocalizações), not
  // a gallery-only number. maxVideos has no other source today (Bio/GeoPlace
  // have no video field), so it stays a plain gallery-only number.
  maxImages: number
  maxVideos: number
  // How much of the image pool is already used by OTHER modules (Bio +
  // Geolocalizações) — subtracted from maxImages to get what's left for this
  // gallery specifically.
  otherImagesUsed: number
  tier: PlanTier
}

export function GalleryEditForm({ initial, profileId, maxImages, maxVideos, otherImagesUsed, tier }: Props) {
  const t = useTranslations("Gallery")
  const tc = useTranslations("Common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const imgInputRef = useRef<HTMLInputElement>(null)
  const vidInputRef = useRef<HTMLInputElement>(null)
  const effectiveMaxImages = Math.max(0, maxImages - otherImagesUsed)
  const [limitContext, setLimitContext] = useState<"media-images" | "media-videos" | null>(null)

  const toEntry = (row: GalleryItemRow): MediaEntry => ({
    id: row.id,
    kind: row.kind as MediaKind,
    url: row.url,
    poster: row.poster ?? undefined,
    durationSec: row.durationSec ?? undefined,
    takenAt: row.takenAt ?? undefined,
    location: row.location ?? undefined,
    description: row.description ?? undefined,
  })

  const [items, setItems] = useState<MediaEntry[]>(initial.map(toEntry))
  const initialRef = useRef<MediaEntry[]>(initial.map(toEntry))

  const images = items.filter((i) => i.kind === "image")
  const videos = items.filter((i) => i.kind === "video")
  const isCreating = initial.length === 0

  const updateMeta = (idx: number, patch: Partial<MediaEntry>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const all = Array.from(files)
    const valid = all.filter(isAllowedImage)
    if (valid.length < all.length) {
      toast.warning(t("filesSkipped", { count: all.length - valid.length, formats: IMAGE_FORMATS_LABEL }))
    }
    if (valid.length === 0) return
    const remaining = effectiveMaxImages - images.length
    if (remaining <= 0) {
      setLimitContext("media-images")
      return
    }
    const upgradeAction = { label: t("upgradePlan"), onClick: () => router.push("/subscriptions") }
    const toProcess = valid.slice(0, remaining)
    if (valid.length > remaining) {
      toast.warning(t("imagesAddedLimit", { remaining, max: effectiveMaxImages }), { action: upgradeAction })
    }

    const placeholders: MediaEntry[] = toProcess.map((f) => ({
      kind: "image",
      url: URL.createObjectURL(f),
      uploading: true,
    }))
    setItems((prev) => [...prev, ...placeholders])

    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      const localUrl = placeholders[i].url
      try {
        const payload = await compressImage(file, { maxDim: 2048 })
        // Client uploads: the file PUTs directly to Vercel Blob, bypassing the
        // 4.5 MB serverless body limit. The route returns a signed token.
        const blob = await upload(`gallery/${payload.name}`, payload, {
          access: "public",
          handleUploadUrl: "/api/gallery/upload",
          contentType: payload.type,
          clientPayload: JSON.stringify({ profileId }),
        })
        setItems((prev) => {
          const next = [...prev]
          const idx = next.findIndex((item) => item.uploading && item.url === localUrl)
          if (idx !== -1) next[idx] = { kind: "image", url: blob.url }
          return next
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("uploadFailed", { name: file.name }))
        setItems((prev) => prev.filter((item) => item.url !== localUrl))
      }
    }
  }

  const handleAddVideos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const all = Array.from(files)
    const valid = all.filter(isAllowedVideo)
    if (valid.length < all.length) {
      toast.warning(t("filesSkipped", { count: all.length - valid.length, formats: VIDEO_FORMATS_LABEL }))
    }
    if (valid.length === 0) return
    const remaining = maxVideos - videos.length
    if (remaining <= 0) {
      setLimitContext("media-videos")
      return
    }
    const upgradeAction = { label: t("upgradePlan"), onClick: () => router.push("/subscriptions") }
    const candidates = valid.slice(0, remaining)
    if (valid.length > remaining) {
      toast.warning(t("videosProcessedLimit", { remaining, max: maxVideos }), { action: upgradeAction })
    }

    for (const file of candidates) {
      let meta
      try {
        meta = await inspectVideo(file)
        if (meta.durationSec > MAX_VIDEO_SECONDS) { toast.error(t("videoTooLong", { name: file.name })); continue }
      } catch {
        toast.error(t("videoUnreadable", { name: file.name })); continue
      }

      const durationSec = meta.durationSec
      const willTranscode = needsTranscode(file, meta)
      const localUrl = URL.createObjectURL(file)
      const placeholder: MediaEntry = {
        kind: "video",
        url: localUrl,
        durationSec,
        uploading: true,
        transcoding: willTranscode,
        transcodeProgress: willTranscode ? 0 : undefined,
      }
      setItems((prev) => [...prev, placeholder])

      let payload: File = file
      if (willTranscode) {
        try {
          payload = await transcodeToHD(file, (r) => {
            setItems((prev) => prev.map((item) =>
              item.url === localUrl ? { ...item, transcodeProgress: r } : item,
            ))
          })
          setItems((prev) => prev.map((item) =>
            item.url === localUrl ? { ...item, transcoding: false, transcodeProgress: undefined } : item,
          ))
        } catch (err) {
          console.error(err)
          toast.error(t("transcodeFailed", { name: file.name }))
          setItems((prev) => prev.filter((item) => item.url !== localUrl))
          continue
        }
      }

      try {
        const blob = await upload(`gallery/${payload.name}`, payload, {
          access: "public",
          handleUploadUrl: "/api/gallery/upload",
          contentType: payload.type,
          clientPayload: JSON.stringify({ profileId }),
        })
        setItems((prev) => {
          const next = [...prev]
          const idx = next.findIndex((item) => item.uploading && item.url === localUrl)
          if (idx !== -1) next[idx] = { kind: "video", url: blob.url, durationSec }
          return next
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("uploadFailed", { name: file.name }))
        setItems((prev) => prev.filter((item) => item.url !== localUrl))
      }
    }
  }

  const handleSave = () => {
    if (items.some((i) => i.uploading)) { toast.warning(t("waitForUploads")); return }
    startTransition(async () => {
      const result = await saveGallery(profileId, {
        items: items.map((item, i) => ({
          id: item.id,
          kind: item.kind,
          url: item.url,
          poster: item.poster,
          durationSec: item.durationSec,
          takenAt: item.takenAt || undefined,
          location: item.location || undefined,
          description: item.description || undefined,
          order: i,
        })),
      })
      if (!result.ok) { toast.error(result.message) } else { toast.success(t("savedToast")); router.push(`/profile/${profileId}/gallery`) }
    })
  }

  const handleReset = () => { setItems(initialRef.current.map((i) => ({ ...i }))); toast(t("resetToast")) }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteGallery(profileId)
      toast.success(t("deletedToast"))
      router.push(`/profile/${profileId}/gallery`)
    })
  }

  const allItems = items

  return (
    <div className="glass-card no-sheen p-6 md:p-8 space-y-10 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Photos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("photos")}</Label>
          <span className="text-xs text-muted-foreground">{images.length}/{effectiveMaxImages}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.length < effectiveMaxImages && (
            <button type="button" onClick={() => imgInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">{t("addImage")}</span>
            </button>
          )}

          {allItems.map((item, idx) => item.kind !== "image" ? null : (
            <div key={idx} className="relative group rounded-xl overflow-hidden border border-border/60 bg-card/40 flex flex-col">
              <div className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={t("previewAlt")} className="h-full w-full object-cover" />
                {item.uploading && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
                {!item.uploading && (
                  <button type="button" onClick={() => removeItem(idx)} className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition" aria-label={tc("remove")}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {!item.uploading && <MetaFields item={item} idx={idx} onChange={(patch) => updateMeta(idx, patch)} />}
            </div>
          ))}
        </div>
        <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => { handleAddImages(e.target.files); e.target.value = "" }} />
      </div>

      {/* Videos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("videos")}</Label>
          <span className="text-xs text-muted-foreground">{videos.length}/{maxVideos}{t("videosHint")}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {videos.length < maxVideos && (
            <button type="button" onClick={() => vidInputRef.current?.click()} className="aspect-video rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground">
              <Film className="h-6 w-6" />
              <span className="text-xs font-medium">{t("addVideo")}</span>
            </button>
          )}

          {allItems.map((item, idx) => item.kind !== "video" ? null : (
            <div key={idx} className="relative group rounded-xl overflow-hidden border border-border/60 bg-card/40 flex flex-col">
              <div className="relative">
                <video src={item.url} controls preload="metadata" className="w-full aspect-video object-cover bg-black" />
                {item.durationSec != null && (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-xs font-medium bg-background/80 backdrop-blur-md border border-border/60">{formatDuration(item.durationSec)}</span>
                )}
                {item.uploading && (
                  <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2">
                    {item.transcoding ? (
                      <>
                        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-xs font-medium">
                          {t("converting", { progress: Math.round((item.transcodeProgress ?? 0) * 100) })}
                        </span>
                      </>
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    )}
                  </div>
                )}
                {!item.uploading && (
                  <button type="button" onClick={() => removeItem(idx)} className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition" aria-label={tc("remove")}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {!item.uploading && <MetaFields item={item} idx={idx} onChange={(patch) => updateMeta(idx, patch)} />}
            </div>
          ))}
        </div>
        <input ref={vidInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" multiple className="hidden" onChange={(e) => { handleAddVideos(e.target.files); e.target.value = "" }} />
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button onClick={handleSave} className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending}><Save className="h-4 w-4" />{tc("save")}</Button>
          {!isCreating && (
            <Button variant="outline" onClick={handleReset} className="gap-2 w-full md:w-auto order-2 md:order-1" disabled={isPending}><RotateCcw className="h-4 w-4" />{t("reset")}</Button>
          )}
        </div>
        {!isCreating && (
          <div className="order-2 md:order-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2 w-full md:w-auto"><Trash2 className="h-4 w-4" />{t("deleteGallery")}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteGalleryTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteGalleryDescription")}</AlertDialogDescription>
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

      <LimitReachedDialog
        open={limitContext !== null}
        onOpenChange={(next) => !next && setLimitContext(null)}
        context={limitContext ?? "media-images"}
        limit={limitContext === "media-videos" ? maxVideos : maxImages}
        tier={tier}
      />
    </div>
  )
}
