'use client'

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { CalendarIcon, ImagePlus, RotateCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { upload } from "@vercel/blob/client"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { cn } from "@/lib/utils"
import { updatePet, deletePet } from "@/actions/pet.actions"
import { getAvatarColor } from "@/lib/avatar-color"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { useTranslations } from "next-intl"
import type { EditProfileRow } from "@/queries/profile"

interface FormState {
  firstName: string
  species: string
  breed: string
  gender: "MALE" | "FEMALE" | "OTHER" | ""
  avatarUrl: string
  birthDate: Date | undefined
  deathDate: Date | undefined
  ownerIds: string[]
}

function buildDefaults(initial: EditProfileRow, ownerIds: string[]): FormState {
  return {
    firstName: initial.firstName,
    species: initial.petSpecies ?? "",
    breed: initial.petBreed ?? "",
    gender: (initial.gender as FormState["gender"]) ?? "",
    avatarUrl: initial.avatarUrl ?? "",
    birthDate: initial.birthDate ?? undefined,
    deathDate: initial.deathDate ?? undefined,
    ownerIds,
  }
}

const DateField = ({ id, label, value, onChange, disabled, disabledDays, clearLabel, pickLabel }: {
  id: string; label: string; value: Date | undefined
  onChange: (d: Date | undefined) => void; disabled?: boolean
  disabledDays?: (d: Date) => boolean
  clearLabel: string; pickLabel: string
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between h-5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {value && !disabled && (
        <button type="button" onClick={() => onChange(undefined)} className="text-xs text-muted-foreground hover:text-foreground">
          {clearLabel}
        </button>
      )}
    </div>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{pickLabel}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date()}
          disabled={disabledDays ?? ((d) => d > new Date())}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  </div>
)

interface Props {
  profileId: string
  initial: EditProfileRow
  rootId: string
  ownerIds: string[]
  ownerOptions: { id: string; name: string }[]
}

export function PetEditForm({ profileId, initial, rootId, ownerIds, ownerOptions }: Props) {
  const t = useTranslations("Pets")
  const tc = useTranslations("Common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const defaults = buildDefaults(initial, ownerIds)
  const [form, setForm] = useState<FormState>(defaults)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const toggleOwner = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      ownerIds: checked
        ? Array.from(new Set([...current.ownerIds, id]))
        : current.ownerIds.filter((ownerId) => ownerId !== id),
    }))
  }

  const initials = form.firstName.slice(0, 2).toUpperCase() || "PT"
  const avatarColor = getAvatarColor(initial.id)

  const handleAvatarChange = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!isAllowedImage(file)) { toast.error(t("avatar.unsupportedFile", { formats: IMAGE_FORMATS_LABEL })); return }
    setUploading(true)
    update("avatarUrl", URL.createObjectURL(file))
    try {
      const payload = await compressImage(file, { maxDim: 512 })
      const blob = await upload(`bio/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/bio/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify({ profileId }),
      })
      update("avatarUrl", blob.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("avatar.uploadError"))
      update("avatarUrl", initial.avatarUrl ?? "")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = () => {
    if (uploading) { toast.warning(t("avatar.waitUploading")); return }
    if (form.ownerIds.length === 0) { toast.error(t("errors.needOwner")); return }
    startTransition(async () => {
      const result = await updatePet(profileId, {
        firstName: form.firstName,
        species: form.species || null,
        breed: form.breed || null,
        gender: form.gender || null,
        birthDate: form.birthDate ?? null,
        deathDate: form.deathDate ?? null,
        avatarUrl: form.avatarUrl || null,
        ownerIds: form.ownerIds,
      }, rootId)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.saved"))
    })
  }

  const handleReset = () => { setForm(defaults); toast(t("toasts.changesReset")) }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePet(profileId)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.push("/profile")
    })
  }

  return (
    <div className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Avatar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <Avatar className="h-28 w-28 ring-4 ring-background shadow-[var(--shadow-glass)]">
          {form.avatarUrl && <AvatarImage src={form.avatarUrl} alt={form.firstName} />}
          <AvatarFallback className={cn("text-xl text-white font-semibold relative", avatarColor)}>
            {initials}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <ImagePlus className="h-4 w-4" />{t("avatar.change")}
          </Button>
          {form.avatarUrl && (
            <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => update("avatarUrl", "")}>
              <Trash2 className="h-4 w-4" />{tc("remove")}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleAvatarChange(e.target.files); e.target.value = "" }} />
        </div>
      </div>

      {/* Name / species / breed */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="pet-name" required>{t("fields.name")}</FieldLabel>
          <Input id="pet-name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder={t("placeholders.name")} maxLength={64} />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="pet-species">{t("fields.species")}</FieldLabel>
          <Input id="pet-species" value={form.species} onChange={(e) => update("species", e.target.value)} placeholder={t("placeholders.species")} maxLength={40} />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="pet-breed">{t("fields.breed")}</FieldLabel>
          <Input id="pet-breed" value={form.breed} onChange={(e) => update("breed", e.target.value)} placeholder={t("placeholders.breed")} maxLength={60} />
        </div>
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <FieldLabel htmlFor="pet-gender">{t("fields.gender")}</FieldLabel>
        <Select value={form.gender} onValueChange={(v) => update("gender", v as FormState["gender"])}>
          <SelectTrigger id="pet-gender"><SelectValue placeholder={t("placeholders.notSpecified")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="FEMALE">{t("gender.female")}</SelectItem>
            <SelectItem value="MALE">{t("gender.male")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateField id="birth-date" label={t("fields.birthDate")} value={form.birthDate} onChange={(d) => update("birthDate", d)} clearLabel={t("date.clear")} pickLabel={t("date.pick")} />
        <DateField
          id="death-date" label={t("fields.deathDate")}
          value={form.deathDate}
          onChange={(d) => update("deathDate", d)}
          disabledDays={(d) => (form.birthDate ? d < form.birthDate : false) || d > new Date()}
          clearLabel={t("date.clear")}
          pickLabel={t("date.pick")}
        />
      </div>

      {/* Owners */}
      <div className="space-y-3">
        <FieldLabel className="text-base">{t("sections.owners")}</FieldLabel>
        <p className="text-sm text-muted-foreground">{t("owners.description")}</p>
        <div className="space-y-2">
          {ownerOptions.map((owner) => (
            <label key={owner.id} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={form.ownerIds.includes(owner.id)}
                onCheckedChange={(checked) => toggleOwner(owner.id, checked === true)}
              />
              {owner.name}
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button onClick={handleSave} className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending || uploading}>
            <Save className="h-4 w-4" />{tc("save")}
          </Button>
          <Button variant="outline" onClick={handleReset} className="gap-2 w-full md:w-auto order-2 md:order-1" disabled={isPending}>
            <RotateCcw className="h-4 w-4" />{t("actions.reset")}
          </Button>
        </div>
        <div className="order-2 md:order-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" className="gap-2 w-full md:w-auto" disabled={isPending}>
                <Trash2 className="h-4 w-4" />{t("delete.button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("delete.description", { name: form.firstName })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {tc("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
