"use client"

import { useRef, useState, useEffect, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ImagePlus, X, Save, RotateCcw, Trash2, LocateFixed } from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { compressImage } from "@/lib/image-compress"
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
import { AddressSection } from "@/components/address/address-section"
import { saveGeolocation, deleteGeolocation } from "@/actions/geolocation.actions"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { getGeolocationSchema, type GeolocationFormValues } from "@/schemas/geolocation.schema"
import type { GeolocationRow } from "@/queries/geolocation"

const MAX_NOTES = 500
const MAX_PHOTOS = 3

interface PlaceSuggestion {
  placeName: string
  zip: string | null
  street: string | null
  // number/complement are not returned by the places API (privacy, B1)
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
  lat: number
  lon: number
}

function buildDefaults(existing: GeolocationRow | null): GeolocationFormValues {
  return {
    placeName: existing?.placeName ?? "",
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
    section: existing?.section ?? "",
    lat: existing?.lat ?? 0,
    lon: existing?.lon ?? 0,
    notes: existing?.notes ?? "",
    photo1: existing?.photo1 ?? null,
    photo2: existing?.photo2 ?? null,
    photo3: existing?.photo3 ?? null,
  }
}

interface Props {
  profileId: string
  existing: GeolocationRow | null
}

export function GeolocationEditForm({ profileId, existing }: Props) {
  const router = useRouter()
  const t = useTranslations("Geolocation")
  const tc = useTranslations("Common")
  const tErr = useTranslations("Errors")
  const [isPending, startTransition] = useTransition()
  const isEditing = !!existing
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<boolean[]>([false, false, false])

  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([])
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placeDropdownRef = useRef<HTMLDivElement>(null)

  const {
    control,
    setValue,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GeolocationFormValues>({
    resolver: useMemo(() => zodResolver(getGeolocationSchema(tErr)), [tErr]),
    defaultValues: buildDefaults(existing),
  })

  const photo1 = useWatch({ control, name: "photo1" }) ?? null
  const photo2 = useWatch({ control, name: "photo2" }) ?? null
  const photo3 = useWatch({ control, name: "photo3" }) ?? null
  const photos: (string | null)[] = [photo1, photo2, photo3]
  const filledPhotoCount = photos.filter(Boolean).length
  const notesValue = useWatch({ control, name: "notes" }) ?? ""

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (placeDropdownRef.current && !placeDropdownRef.current.contains(e.target as Node)) {
        setPlaceSuggestions([])
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const { onChange: placeRegOnChange, ...placeRestRegister } = register("placeName")

  function handlePlaceNameChange(value: string) {
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current)
    if (value.length < 2) { setPlaceSuggestions([]); return }
    placeDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geolocation/places?q=${encodeURIComponent(value)}`)
        if (res.ok) {
          const data: PlaceSuggestion[] = await res.json()
          setPlaceSuggestions(data)
        }
      } catch {
        // silently ignore typeahead errors
      }
    }, 300)
  }

  function applyPlaceSuggestion(s: PlaceSuggestion) {
    setValue("placeName",            s.placeName,               { shouldValidate: true })
    setValue("address.zip",          s.zip          ?? "")
    setValue("address.street",       s.street       ?? "")
    // number/complement are not autofilled from another place (privacy, B1)
    setValue("address.neighborhood", s.neighborhood ?? "")
    setValue("address.city",         s.city         ?? "")
    setValue("address.state",        s.state        ?? "")
    setValue("address.country",      s.country      ?? "BR")
    if (s.lat !== 0 || s.lon !== 0) {
      setValue("lat", s.lat)
      setValue("lon", s.lon)
    }
    setPlaceSuggestions([])
  }

  const setPhotoAt = (slot: number, value: string | null) => {
    const key = (["photo1", "photo2", "photo3"] as const)[slot]
    setValue(key, value, { shouldDirty: true })
  }

  const handleAddPhoto = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!isAllowedImage(file)) {
      toast.error(t("toasts.unsupportedFile", { formats: IMAGE_FORMATS_LABEL }))
      return
    }
    const slot = photos.findIndex((p) => p == null)
    if (slot === -1) return
    const preview = URL.createObjectURL(file)
    setPhotoAt(slot, preview)
    setUploading((prev) => { const u = [...prev]; u[slot] = true; return u })
    try {
      const payload = await compressImage(file, { maxDim: 2048 })
      const blob = await upload(`geolocation/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/geolocation/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify({ profileId }),
      })
      setPhotoAt(slot, blob.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.uploadFailed"))
      setPhotoAt(slot, null)
    } finally {
      setUploading((prev) => { const u = [...prev]; u[slot] = false; return u })
    }
  }

  const removePhoto = (slot: number) => {
    const next = [...photos]
    next[slot] = null
    const filled = next.filter(Boolean) as string[]
    setPhotoAt(0, filled[0] ?? null)
    setPhotoAt(1, filled[1] ?? null)
    setPhotoAt(2, filled[2] ?? null)
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
        if (err.code === err.PERMISSION_DENIED) {
          toast.error(t("toasts.locationDenied"))
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error(t("toasts.locationUnavailable"))
        } else {
          toast.error(t("toasts.locationTimeout"))
        }
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  const onSubmit = (data: GeolocationFormValues) => {
    if (uploading.some(Boolean)) { toast.warning(t("toasts.waitForUploads")); return }
    startTransition(async () => {
      const result = await saveGeolocation(profileId, data)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.saved"))
      router.push(`/profile/${profileId}/geolocation`)
    })
  }

  const handleReset = () => {
    reset(buildDefaults(existing))
    toast(t("toasts.reset"))
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteGeolocation(profileId)
      toast.success(t("toasts.deleted"))
      router.push(`/profile/${profileId}/geolocation`)
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
          <span className="text-xs text-muted-foreground">{filledPhotoCount}/{MAX_PHOTOS}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {photos.map((photo, slot) =>
            photo ? (
              <div key={slot} className="relative group aspect-square rounded-xl overflow-hidden border border-border/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={t("photoAlt", { number: slot + 1 })} className="h-full w-full object-cover" />
                {uploading[slot] && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
                {!uploading[slot] && (
                  <button
                    type="button"
                    onClick={() => removePhoto(slot)}
                    className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
                    aria-label={t("removePhoto")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : null
          )}
          {filledPhotoCount < MAX_PHOTOS && (
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
          className="hidden"
          onChange={(e) => { handleAddPhoto(e.target.files); e.target.value = "" }}
        />
      </div>

      {/* Place name with typeahead */}
      <div className="space-y-2">
        <Label htmlFor="geo-place" className="text-base">{t("placeName")}</Label>
        <div className="relative" ref={placeDropdownRef}>
          <Input
            id="geo-place"
            maxLength={120}
            placeholder={t("placeNamePlaceholder")}
            {...placeRestRegister}
            onChange={(e) => {
              placeRegOnChange(e)
              handlePlaceNameChange(e.target.value)
            }}
            onKeyDown={(e) => { if (e.key === "Escape") setPlaceSuggestions([]) }}
            autoComplete="off"
          />
          {placeSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-background shadow-lg">
              <ul className="divide-y divide-border">
                {placeSuggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition"
                      onClick={() => applyPlaceSuggestion(s)}
                    >
                      <span className="font-medium">{s.placeName}</span>
                      {(s.city || s.country) && (
                        <span className="ml-2 text-muted-foreground">
                          — {[s.city, s.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {errors.placeName && <p className="text-xs text-destructive">{errors.placeName.message}</p>}
      </div>

      {/* Address (BMS-style with CEP search) */}
      <div className="space-y-3">
        <Label className="text-base">{t("address")}</Label>
        <AddressSection
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          control={control as any}
          setValue={setValue}
          errors={errors}
          prefix="address"
        />
      </div>

      {/* Section / plot */}
      <div className="space-y-2">
        <Label htmlFor="geo-section" className="text-base">{t("section")}</Label>
        <Input id="geo-section" maxLength={200} placeholder={t("sectionPlaceholder")} {...register("section")} />
      </div>

      {/* Coordinates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("coordinates")}</Label>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="geo-lat" className="text-xs text-muted-foreground">{t("latitude")}</Label>
            <Input id="geo-lat" type="number" step="any" min={-90} max={90} placeholder="-25.4284" {...register("lat", { valueAsNumber: true })} />
            {errors.lat && <p className="text-xs text-destructive">{errors.lat.message}</p>}
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="geo-lon" className="text-xs text-muted-foreground">{t("longitude")}</Label>
            <Input id="geo-lon" type="number" step="any" min={-180} max={180} placeholder="-49.2733" {...register("lon", { valueAsNumber: true })} />
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

      {/* Notes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="geo-notes" className="text-base">{t("notes")}</Label>
          <span className="text-xs text-muted-foreground">{notesValue.length}/{MAX_NOTES}</span>
        </div>
        <Textarea
          id="geo-notes"
          maxLength={MAX_NOTES}
          placeholder={t("notesPlaceholder")}
          className="min-h-[140px] text-base leading-relaxed"
          {...register("notes")}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button type="submit" className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending || uploading.some(Boolean)}>
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
                  <Trash2 className="h-4 w-4" />{t("deleteLocation")}
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
