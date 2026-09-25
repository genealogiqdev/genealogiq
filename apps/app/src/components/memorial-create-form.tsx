'use client'

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { CalendarIcon, ImagePlus, RotateCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { createMemorial } from "@/actions/memorial.actions"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { useLocale, useTranslations } from "next-intl"
import { getLocalizedCountries } from "@/consts/countries-data"

interface FormState {
  firstName: string
  lastName: string
  gender: "MALE" | "FEMALE" | "OTHER" | ""
  avatarUrl: string
  birthDate: Date | undefined
  birthPlace: string
  birthCountry: string
  deathDate: Date | undefined
  deathPlace: string
  deathCountry: string
}

const empty: FormState = {
  firstName: "", lastName: "", gender: "", avatarUrl: "",
  birthDate: undefined, birthPlace: "", birthCountry: "",
  deathDate: undefined, deathPlace: "", deathCountry: "",
}

const DateField = ({ id, label, value, onChange, disabled, disabledDays, clearLabel, pickLabel, required }: {
  id: string; label: string; value: Date | undefined
  onChange: (d: Date | undefined) => void; disabled?: boolean
  disabledDays?: (d: Date) => boolean
  clearLabel: string; pickLabel: string; required?: boolean
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between h-5">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
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

export function MemorialCreateForm() {
  const locale = useLocale()
  const t = useTranslations("Memorialized")
  const tc = useTranslations("Common")
  const countryOptions = getLocalizedCountries(locale)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<FormState>(empty)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const initials = [form.firstName[0], form.lastName[0]].filter(Boolean).join("").toUpperCase() || "GQ"

  const handleAvatarChange = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!isAllowedImage(file)) {
      toast.error(t("avatar.unsupportedFile", { formats: IMAGE_FORMATS_LABEL }))
      return
    }
    setUploading(true)
    update("avatarUrl", URL.createObjectURL(file))
    try {
      const payload = await compressImage(file, { maxDim: 512 })
      const blob = await upload(`bio/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/bio/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify({ scope: "create-memorial" }),
      })
      update("avatarUrl", blob.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("avatar.uploadError"))
      update("avatarUrl", "")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = () => {
    if (uploading) { toast.warning(t("avatar.waitUploading")); return }
    startTransition(async () => {
      const result = await createMemorial({
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender || null,
        birthDate: form.birthDate,
        birthPlace: form.birthPlace || undefined,
        birthCountry: form.birthCountry || undefined,
        deathDate: form.deathDate ?? null,
        deathPlace: form.deathPlace || undefined,
        deathCountry: form.deathCountry || undefined,
        avatarUrl: form.avatarUrl || null,
      })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.created"))
      router.push(`/profile/${result.data!.id}`)
    })
  }

  const handleReset = () => {
    setForm(empty)
    toast(t("toasts.formReset"))
  }

  return (
    <div className="glass-card no-sheen p-6 md:p-8 space-y-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Avatar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <Avatar className="h-28 w-28 ring-4 ring-background shadow-[var(--shadow-glass)]">
          {form.avatarUrl && <AvatarImage src={form.avatarUrl} alt={`${form.firstName} ${form.lastName}`} />}
          <AvatarFallback className="text-xl bg-secondary relative">
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

      {/* Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="first-name" required>{t("fields.firstName")}</FieldLabel>
          <Input id="first-name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder={t("placeholders.firstName")} maxLength={100} />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="last-name" required>{t("fields.lastName")}</FieldLabel>
          <Input id="last-name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder={t("placeholders.lastName")} maxLength={100} />
        </div>
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <FieldLabel htmlFor="gender">{t("fields.gender")}</FieldLabel>
        <Select value={form.gender} onValueChange={(v) => update("gender", v as FormState["gender"])}>
          <SelectTrigger id="gender"><SelectValue placeholder={t("placeholders.notSpecified")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="FEMALE">{t("gender.female")}</SelectItem>
            <SelectItem value="MALE">{t("gender.male")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Birth */}
      <div className="space-y-3">
        <FieldLabel className="text-base">{t("sections.birth")}</FieldLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DateField id="birth-date" label={t("fields.date")} value={form.birthDate} onChange={(d) => update("birthDate", d)} clearLabel={t("date.clear")} pickLabel={t("date.pick")} required />
          <div className="space-y-2">
            <FieldLabel htmlFor="birth-place">{t("fields.city")}</FieldLabel>
            <Input id="birth-place" value={form.birthPlace} onChange={(e) => update("birthPlace", e.target.value)} placeholder={t("placeholders.city")} maxLength={100} />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="birth-country">{t("fields.country")}</FieldLabel>
            <Select value={form.birthCountry} onValueChange={(v) => update("birthCountry", v)}>
              <SelectTrigger id="birth-country"><SelectValue placeholder={t("placeholders.country")} /></SelectTrigger>
              <SelectContent>{countryOptions.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Death */}
      <div className="space-y-3">
        <FieldLabel className="text-base">{t("sections.death")}</FieldLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DateField
            id="death-date" label={t("fields.date")}
            value={form.deathDate}
            onChange={(d) => { update("deathDate", d); if (!d) { update("deathPlace", ""); update("deathCountry", "") } }}
            disabledDays={(d) => (form.birthDate ? d < form.birthDate : false) || d > new Date()}
            clearLabel={t("date.clear")}
            pickLabel={t("date.pick")}
            required
          />
          <div className="space-y-2">
            <FieldLabel htmlFor="death-place">{t("fields.city")}</FieldLabel>
            <Input id="death-place" value={form.deathPlace} onChange={(e) => update("deathPlace", e.target.value)} placeholder={t("placeholders.city")} disabled={!form.deathDate} maxLength={100} />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="death-country">{t("fields.country")}</FieldLabel>
            <Select value={form.deathCountry} onValueChange={(v) => update("deathCountry", v)} disabled={!form.deathDate}>
              <SelectTrigger id="death-country"><SelectValue placeholder={t("placeholders.country")} /></SelectTrigger>
              <SelectContent>{countryOptions.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2 border-t border-border/60">
        <Button variant="outline" onClick={handleReset} className="gap-2" disabled={isPending}>
          <RotateCcw className="h-4 w-4" />{t("actions.reset")}
        </Button>
        <Button onClick={handleSave} className="gap-2" disabled={isPending || uploading}>
          <Save className="h-4 w-4" />{t("actions.createProfile")}
        </Button>
      </div>
    </div>
  )
}
