"use client"

import { useRef, useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ImagePlus, X, Save, RotateCcw, Trash2, LocateFixed } from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldLabel } from "@/components/ui/field"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { AddressSection } from "@/components/address/address-section"
import { PlaceCategorySelect } from "@/components/place-category-select"
import { LimitReachedDialog } from "@/components/limit-reached-dialog"
import { savePlace, deletePlace } from "@/actions/places.actions"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { getPlaceSchema, type PlaceFormValues, PLACE_MAX_PHOTOS } from "@/schemas/place.schema"
import type { PlanTier } from "@/lib/plan-quotas"
import type { GeoPlaceRow } from "@/queries/places"

function toISODate(date: Date | null | undefined): string {
  if (!date) return ""
  return date.toISOString().slice(0, 10)
}

function buildDefaults(existing: GeoPlaceRow | null): PlaceFormValues {
  return {
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    categories: existing?.categories ?? [],
    address: {
      zip:          existing?.zip          ?? "",
      street:       existing?.street       ?? "",
      number:       existing?.number       ?? "",
      complement:   existing?.complement   ?? "",
      neighborhood: existing?.neighborhood ?? "",
      city:         existing?.city         ?? "",
      state:        existing?.state        ?? "",
      country:      existing?.country      ?? "BR",
    },
    lat: existing?.lat ?? 0,
    lon: existing?.lon ?? 0,
    photos: existing?.photos ?? [],
    startDate: toISODate(existing?.startDate) || null,
    endDate: toISODate(existing?.endDate) || null,
  }
}

interface Props {
  profileId: string
  existing: GeoPlaceRow | null
  // The plan's combined image pool max (shared with Bio/Gallery), not a
  // places-only number.
  mediaMax: number
  // How many of that pool are already used by OTHER modules AND other places
  // — subtracted from mediaMax to get what's left for THIS place specifically.
  otherImagesUsed: number
  tier: PlanTier
}

export function PlaceEditForm({ profileId, existing, mediaMax, otherImagesUsed, tier }: Props) {
  const router = useRouter()
  const t = useTranslations("Places")
  const tc = useTranslations("Common")
  const tErr = useTranslations("Errors")
  const [isPending, startTransition] = useTransition()
  const isEditing = !!existing
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)
  const effectiveMediaMax = Math.max(0, mediaMax - otherImagesUsed)
  const photoRoomMax = Math.min(PLACE_MAX_PHOTOS, effectiveMediaMax)

  const {
    control,
    setValue,
    getValues,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlaceFormValues>({
    resolver: useMemo(() => zodResolver(getPlaceSchema(tErr)), [tErr]),
    defaultValues: buildDefaults(existing),
  })

  const photos = useWatch({ control, name: "photos" }) ?? []
  const descriptionValue = useWatch({ control, name: "description" }) ?? ""

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (photos.length >= effectiveMediaMax) {
      setLimitDialogOpen(true)
      return
    }
    const room = photoRoomMax - photos.length
    const picked = Array.from(files).slice(0, room)

    for (const file of picked) {
      if (!isAllowedImage(file)) {
        toast.error(t("toasts.unsupportedFile", { formats: IMAGE_FORMATS_LABEL }))
        continue
      }
      setUploadingCount((n) => n + 1)
      try {
        const payload = await compressImage(file, { maxDim: 2048 })
        const blob = await upload(`places/${payload.name}`, payload, {
          access: "public",
          handleUploadUrl: "/api/places/upload",
          contentType: payload.type,
          clientPayload: JSON.stringify({ profileId }),
        })
        setValue("photos", [...getValues("photos"), blob.url], { shouldDirty: true })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toasts.uploadFailed"))
      } finally {
        setUploadingCount((n) => n - 1)
      }
    }
  }

  const removePhoto = (url: string) => {
    setValue("photos", photos.filter((p) => p !== url), { shouldDirty: true })
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) { toast.error(t("toasts.geolocationUnsupported")); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue("lat", parseFloat(pos.coords.latitude.toFixed(6)), { shouldDirty: true })
        setValue("lon", parseFloat(pos.coords.longitude.toFixed(6)), { shouldDirty: true })
        toast.success(t("toasts.locationDetected"))
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) toast.error(t("toasts.locationDenied"))
        else if (err.code === err.POSITION_UNAVAILABLE) toast.error(t("toasts.locationUnavailable"))
        else toast.error(t("toasts.locationTimeout"))
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  const onSubmit = (data: PlaceFormValues) => {
    if (uploadingCount > 0) { toast.warning(t("toasts.waitForUploads")); return }
    startTransition(async () => {
      const result = await savePlace(profileId, existing?.id ?? null, data)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.saved"))
      router.push(`/profile/${profileId}/places`)
    })
  }

  const handleReset = () => {
    reset(buildDefaults(existing))
    toast(t("toasts.reset"))
  }

  const handleDelete = () => {
    if (!existing) return
    startTransition(async () => {
      const result = await deletePlace(profileId, existing.id)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.push(`/profile/${profileId}/places`)
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => toast.error(t("toasts.fixFields")))}
      className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in"
      style={{ animationDelay: "80ms" }}
    >
      {/* Photos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("photos")}</Label>
          <span className="text-xs text-muted-foreground">{photos.length}/{photoRoomMax}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, i) => (
            <div key={photo} className="relative group aspect-square rounded-xl overflow-hidden border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={t("photoAlt", { number: i + 1 })} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo)}
                className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
                aria-label={t("removePhoto")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < photoRoomMax && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border/70 hover:border-primary hover:bg-accent/40 transition flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">{t("addImage")}</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { handleAddPhotos(e.target.files); e.target.value = "" }}
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <FieldLabel htmlFor="place-title" className="text-base" required>{t("titleLabel")}</FieldLabel>
        <Input id="place-title" maxLength={120} placeholder={t("titlePlaceholder")} {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <FieldLabel className="text-base" required>{t("categoriesLabel")}</FieldLabel>
        <Controller
          control={control}
          name="categories"
          render={({ field }) => (
            <PlaceCategorySelect value={field.value ?? []} onChange={field.onChange} />
          )}
        />
        <p className="text-xs text-muted-foreground">{t("categoriesHint")}</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="place-description" className="text-base">{t("descriptionLabel")}</Label>
          <span className="text-xs text-muted-foreground">{descriptionValue.length}/2000</span>
        </div>
        <Textarea
          id="place-description"
          maxLength={2000}
          placeholder={t("descriptionPlaceholder")}
          className="min-h-[140px] text-base leading-relaxed"
          {...register("description")}
        />
      </div>

      {/* Coordinates */}
      <div className="space-y-2">
        <Label className="text-base">{t("coordinates")}</Label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="place-lat" className="text-xs text-muted-foreground">{t("latitude")}</Label>
            <Input id="place-lat" type="number" step="any" min={-90} max={90} placeholder="-25.4284" {...register("lat", { valueAsNumber: true })} />
            {errors.lat && <p className="text-xs text-destructive">{errors.lat.message}</p>}
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="place-lon" className="text-xs text-muted-foreground">{t("longitude")}</Label>
            <Input id="place-lon" type="number" step="any" min={-180} max={180} placeholder="-49.2733" {...register("lon", { valueAsNumber: true })} />
            {errors.lon && <p className="text-xs text-destructive">{errors.lon.message}</p>}
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={handleUseMyLocation} className="gap-2 w-full sm:w-auto">
              <LocateFixed className="h-4 w-4" />
              {t("useMyLocation")}
            </Button>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="space-y-2">
        <Label className="text-base">{t("datesLabel")}</Label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <FieldLabel htmlFor="place-start" className="text-xs text-muted-foreground" required>{t("startDate")}</FieldLabel>
            <Input id="place-start" type="date" {...register("startDate")} />
            {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="place-end" className="text-xs text-muted-foreground">{t("endDate")}</Label>
            <Input id="place-end" type="date" {...register("endDate")} />
            {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
          </div>
        </div>
      </div>

      {/* Address (collapsible) */}
      <Accordion type="single" collapsible>
        <AccordionItem value="address" className="border-none">
          <AccordionTrigger className="text-base font-medium hover:no-underline py-0">
            {t("address")}
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <AddressSection
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              control={control as any}
              setValue={setValue}
              errors={errors}
              prefix="address"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button type="submit" className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending || uploadingCount > 0}>
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
                  <Trash2 className="h-4 w-4" />{t("deletePlace")}
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

      <LimitReachedDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        context="media-images"
        limit={mediaMax}
        tier={tier}
      />
    </form>
  )
}
