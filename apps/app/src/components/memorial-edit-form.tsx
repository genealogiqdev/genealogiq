'use client'

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch, Controller, type Control, type FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import {
  User, Calendar, Flower, Phone, MapPin, Globe, FileText,
  CalendarIcon, Image as ImageIcon, Trash2, Save, RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { uploadMedia as upload } from "@genealogiq/core"
import { compressImage } from "@/lib/image-compress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
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
import { ChangeEmailDialog } from "@/components/auth/change-email-dialog"
import { getProfileEditSchema, type ProfileEditValues } from "@/schemas/profile.schema"
import { addressDefaultValues } from "@/schemas/address.schema"
import { maskPhoneByCountry, unmaskDigits } from "@/lib/masks"
import { updateProfile } from "@/actions/profile.actions"
import { updateMemorial, deleteMemorial } from "@/actions/memorial.actions"
import { getAvatarColor } from "@/lib/avatar-color"
import { isAllowedImage, IMAGE_FORMATS_LABEL } from "@/lib/upload-validation"
import { useLocale, useTranslations } from "next-intl"
import { getLocalizedCountries, COUNTRY_BY_ISO } from "@/consts/countries-data"
import { cn } from "@/lib/utils"
import type { EditProfileRow } from "@/queries/profile"

// ─── Date picker helper ───────────────────────────────────────────────────────

function DateField({
  name, label, control, setValue, disabled, minDate, clearLabel, pickLabel, required, error,
}: {
  name: string; label: string
  control: Control<ProfileEditValues>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (name: any, value: any) => void
  disabled?: boolean; minDate?: Date
  clearLabel: string; pickLabel: string
  required?: boolean; error?: string
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value: Date | null = useWatch({ control: control as any, name }) ?? null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between h-5">
        <FieldLabel required={required}>{label}</FieldLabel>
        {value && !disabled && (
          <button type="button" onClick={() => setValue(name, null)} className="text-xs text-muted-foreground hover:text-foreground">
            {clearLabel}
          </button>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
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
          <CalendarPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => setValue(name, d ?? null)}
            captionLayout="dropdown"
            startMonth={new Date(1900, 0)}
            endMonth={new Date()}
            disabled={(d) => d > new Date() || (minDate ? d < minDate : false)}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      <FieldError errors={[{ message: error }]} />
    </div>
  )
}

// ─── State / Province (cascades from the chosen country) ───────────────────────
// BR / MX / US carry a states list → render a Select; every other country falls
// back to a free-text Input. Mirrors the AddressSection pattern.

function StateField({
  control, countryField, stateField, id, label, placeholder, disabled, error, required,
}: {
  control: Control<ProfileEditValues>
  countryField: "birthCountry" | "deathCountry"
  stateField: "birthState" | "deathState"
  id: string; label: string; placeholder: string; disabled?: boolean; error?: string; required?: boolean
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const country = (useWatch({ control: control as any, name: countryField }) as string) ?? ""
  const states = COUNTRY_BY_ISO[country]?.states ?? []
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <Controller
        control={control}
        name={stateField}
        render={({ field }) =>
          states.length > 0 ? (
            <Select value={(field.value as string) ?? ""} onValueChange={field.onChange} disabled={disabled}>
              <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={id}
              maxLength={100}
              disabled={disabled}
              placeholder={placeholder}
              value={(field.value as string) ?? ""}
              onChange={field.onChange}
            />
          )
        }
      />
      <FieldError errors={[{ message: error }]} />
    </div>
  )
}

// ─── Section trigger ──────────────────────────────────────────────────────────

function SectionTrigger({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span>{label}</span>
    </div>
  )
}

// ─── Default values ───────────────────────────────────────────────────────────

function buildDefaults(initial: EditProfileRow): ProfileEditValues {
  return {
    firstName:    initial.firstName,
    lastName:     initial.lastName,
    maidenName:   initial.maidenName   ?? "",
    nickname:     initial.nickname     ?? "",
    gender:       (initial.gender as ProfileEditValues["gender"]) ?? null,
    avatarUrl:    initial.avatarUrl    ?? null,
    birthDate:    initial.birthDate    ?? null,
    birthPlace:   initial.birthPlace   ?? "",
    birthState:   initial.birthState   ?? "",
    birthCountry: initial.birthCountry ?? "",
    deathDate:    initial.deathDate    ?? null,
    deathPlace:   initial.deathPlace   ?? "",
    deathState:   initial.deathState   ?? "",
    deathCountry: initial.deathCountry ?? "",
    deathCause:   initial.deathCause   ?? "",
    phoneCountryCode: initial.phoneCountryCode ?? "55",
    phone:            initial.phone            ?? "",
    website:      initial.website      ?? "",
    instagram:    initial.instagram    ?? "",
    linkedin:     initial.linkedin     ?? "",
    fb:           initial.fb           ?? "",
    x:            initial.x            ?? "",
    tiktok:       initial.tiktok       ?? "",
    youtube:      initial.youtube      ?? "",
    otherSocial:  initial.otherSocial  ?? "",
    notes:        initial.notes        ?? "",
    isPublicProfile: initial.isPublicProfile,
    address: {
      zip:          initial.address?.zip          ?? addressDefaultValues.zip,
      street:       initial.address?.street       ?? addressDefaultValues.street,
      number:       initial.address?.number       ?? addressDefaultValues.number,
      complement:   initial.address?.complement   ?? addressDefaultValues.complement,
      neighborhood: initial.address?.neighborhood ?? addressDefaultValues.neighborhood,
      city:         initial.address?.city         ?? addressDefaultValues.city,
      state:        initial.address?.state        ?? addressDefaultValues.state,
      country:      initial.address?.country      ?? addressDefaultValues.country,
    },
  }
}

// ─── Accordion section membership (for opening sections that contain errors) ──

const SECTION_FIELDS: Record<string, ReadonlyArray<keyof ProfileEditValues>> = {
  identity: ["avatarUrl", "firstName", "lastName", "maidenName", "nickname", "gender"],
  birth:    ["birthDate", "birthCountry", "birthPlace", "birthState"],
  death:    ["deathDate", "deathCountry", "deathPlace", "deathState", "deathCause"],
  contact:  ["phoneCountryCode", "phone"],
  address:  ["address"],
  social:   ["website", "instagram", "linkedin", "fb", "x", "tiktok", "youtube", "otherSocial"],
  notes:    ["notes"],
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  profileId: string
  initial: EditProfileRow
  isMemorialized?: boolean
}

export function MemorialEditForm({ profileId, initial, isMemorialized = true }: Props) {
  const locale        = useLocale()
  const t             = useTranslations("Memorialized")
  const tc            = useTranslations("Common")
  const tErr          = useTranslations("Errors")
  const countryOptions = getLocalizedCountries(locale)
  const router        = useRouter()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading]    = useState(false)
  const [openSections, setOpenSections] = useState<string[]>(["identity"])
  const fileInputRef  = useRef<HTMLInputElement>(null)

  const defaults = buildDefaults(initial)

  const { control, register, setValue, handleSubmit, reset, watch, formState: { errors } } =
    useForm<ProfileEditValues>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: useMemo(() => zodResolver(getProfileEditSchema(tErr, isMemorialized)) as any, [tErr, isMemorialized]),
      defaultValues: defaults,
    })

  const avatarUrl  = watch("avatarUrl")
  const firstName  = watch("firstName")
  const lastName   = watch("lastName")
  const deathDate  = watch("deathDate")
  const birthDate  = watch("birthDate")
  const phoneCountryCode = watch("phoneCountryCode")

  const initials    = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"
  const avatarColor = getAvatarColor(initial.id)

  // ── Avatar upload ───────────────────────────────────────────────────────────

  const handleAvatarChange = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!isAllowedImage(file)) { toast.error(t("avatar.unsupportedFile", { formats: IMAGE_FORMATS_LABEL })); return }
    setUploading(true)
    setValue("avatarUrl", URL.createObjectURL(file))
    try {
      const payload = await compressImage(file, { maxDim: 512 })
      const blob = await upload(`bio/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/bio/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify({ profileId: initial.id }),
      })
      setValue("avatarUrl", blob.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("avatar.uploadError"))
      setValue("avatarUrl", initial.avatarUrl ?? null)
    } finally {
      setUploading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = (values: any) => {
    const typed = values as ProfileEditValues
    if (uploading) { toast.warning(t("avatar.waitUploading")); return }
    startTransition(async () => {
      const result = isMemorialized
        ? await updateMemorial(profileId, typed)
        : await updateProfile(typed)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.saved"))
    })
  }

  // Opens (without collapsing) every accordion section that has a field error.
  const onInvalid = (formErrors: FieldErrors<ProfileEditValues>) => {
    const errorKeys = Object.keys(formErrors) as (keyof ProfileEditValues)[]
    const sectionsWithErrors = Object.entries(SECTION_FIELDS)
      .filter(([, fields]) => fields.some((f) => errorKeys.includes(f)))
      .map(([section]) => section)
    setOpenSections((prev) => Array.from(new Set([...prev, ...sectionsWithErrors])))
    toast.error(t("toasts.fixFields"))
  }

  const handleReset  = () => { reset(defaults); toast(t("toasts.changesReset")) }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteMemorial(profileId)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.deleted"))
      router.push("/profile")
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-3 animate-fade-in" style={{ animationDelay: "80ms" }}>
      {/* Public-visibility toggle — fixed card, not tucked in an accordion
          section: profiles are public by DEFAULT (opt-out model), so the
          control needs to be seen without expanding anything. */}
      {!isMemorialized && (
        <div className="glass-card no-sheen rounded-2xl p-5 flex items-center justify-between gap-4 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3 min-w-0">
            <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("privacy.label")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("privacy.description")}</p>
            </div>
          </div>
          <Controller
            control={control}
            name="isPublicProfile"
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t("privacy.label")} />
            )}
          />
        </div>
      )}

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">

        {/* ── Identity ─────────────────────────────────────────── */}
        <AccordionItem value="identity" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
          <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
            <SectionTrigger icon={User} label={t("sections.identity")} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-6 pb-6 pt-4 space-y-6">
              {/* Avatar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <Avatar className="h-28 w-28 ring-4 ring-background shadow-[var(--shadow-glass)]">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={`${firstName} ${lastName}`} />}
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
                  <Button type="button" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <ImageIcon className="h-4 w-4" />{t("avatar.change")}
                  </Button>
                  {avatarUrl && (
                    <Button type="button" variant="ghost" className="gap-2 text-muted-foreground" onClick={() => setValue("avatarUrl", null)}>
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
                  <Input id="first-name" maxLength={100} placeholder={t("placeholders.firstName")} {...register("firstName")} />
                  <FieldError errors={[errors.firstName]} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="last-name" required>{t("fields.lastName")}</FieldLabel>
                  <Input id="last-name" maxLength={100} placeholder={t("placeholders.lastName")} {...register("lastName")} />
                  <FieldError errors={[errors.lastName]} />
                </div>
              </div>

              {/* Maiden name + Nickname */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel htmlFor="maiden-name">{t("fields.maidenName")}</FieldLabel>
                  <Input id="maiden-name" maxLength={100} placeholder={t("placeholders.maidenName")} {...register("maidenName")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="nickname">{t("fields.nickname")}</FieldLabel>
                  <Input id="nickname" maxLength={100} placeholder={t("placeholders.nickname")} {...register("nickname")} />
                </div>
              </div>

              {/* Gender (6 cols) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel htmlFor="gender" required>{t("fields.gender")}</FieldLabel>
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || null)}>
                        <SelectTrigger id="gender"><SelectValue placeholder={t("placeholders.notSpecified")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FEMALE">{t("gender.female")}</SelectItem>
                          <SelectItem value="MALE">{t("gender.male")}</SelectItem>
                          <SelectItem value="OTHER">{t("gender.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.gender]} />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Birth ────────────────────────────────────────────── */}
        <AccordionItem value="birth" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
          <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
            <SectionTrigger icon={Calendar} label={t("sections.birth")} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-6 pb-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DateField name="birthDate" label={t("fields.date")} control={control} setValue={setValue} clearLabel={t("date.clear")} pickLabel={t("date.pick")} required error={errors.birthDate?.message} />
                <div className="space-y-2">
                  <FieldLabel htmlFor="birth-country" required>{t("fields.country")}</FieldLabel>
                  <Controller
                    control={control}
                    name="birthCountry"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={(val) => { field.onChange(val); setValue("birthState", "") }}>
                        <SelectTrigger id="birth-country"><SelectValue placeholder={t("placeholders.country")} /></SelectTrigger>
                        <SelectContent>{countryOptions.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.birthCountry]} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="birth-city" required>{t("fields.city")}</FieldLabel>
                  <Input id="birth-city" maxLength={100} placeholder={t("placeholders.city")} {...register("birthPlace")} />
                  <FieldError errors={[errors.birthPlace]} />
                </div>
                <StateField
                  control={control}
                  countryField="birthCountry"
                  stateField="birthState"
                  id="birth-state"
                  label={t("fields.state")}
                  placeholder={t("placeholders.state")}
                  error={errors.birthState?.message}
                  required
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Death (memorialized only) ─────────────────────────── */}
        {isMemorialized && (
          <AccordionItem value="death" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
            <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
              <SectionTrigger icon={Flower} label={t("sections.death")} />
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-6 pb-6 pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DateField
                    name="deathDate" label={t("fields.date")} control={control} setValue={setValue}
                    clearLabel={t("date.clear")} pickLabel={t("date.pick")}
                    required error={errors.deathDate?.message}
                    minDate={birthDate ?? undefined}
                  />
                  <div className="space-y-2">
                    <FieldLabel htmlFor="death-country" required>{t("fields.country")}</FieldLabel>
                    <Controller
                      control={control}
                      name="deathCountry"
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={(val) => { field.onChange(val); setValue("deathState", "") }} disabled={!deathDate}>
                          <SelectTrigger id="death-country"><SelectValue placeholder={t("placeholders.country")} /></SelectTrigger>
                          <SelectContent>{countryOptions.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError errors={[errors.deathCountry]} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel htmlFor="death-city" required>{t("fields.city")}</FieldLabel>
                    <Input id="death-city" maxLength={100} placeholder={t("placeholders.city")} disabled={!deathDate} {...register("deathPlace")} />
                    <FieldError errors={[errors.deathPlace]} />
                  </div>
                  <StateField
                    control={control}
                    countryField="deathCountry"
                    stateField="deathState"
                    id="death-state"
                    label={t("fields.state")}
                    placeholder={t("placeholders.state")}
                    disabled={!deathDate}
                    error={errors.deathState?.message}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="death-cause">{t("fields.deathCause")}</FieldLabel>
                  <Input id="death-cause" maxLength={200} placeholder={t("placeholders.deathCause")} disabled={!deathDate} {...register("deathCause")} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Contact (living profiles only) ────────────────────── */}
        {!isMemorialized && (
          <AccordionItem value="contact" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
            <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
              <SectionTrigger icon={Phone} label={t("sections.contact")} />
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-6 pb-6 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="space-y-2 w-full sm:w-20 shrink-0">
                    <FieldLabel htmlFor="phone-cc">{t("fields.countryCode")}</FieldLabel>
                    <Input id="phone-cc" maxLength={5} placeholder="+55" {...register("phoneCountryCode")} />
                  </div>
                  <div className="space-y-2 flex-1">
                    <FieldLabel htmlFor="phone">{t("fields.phone")}</FieldLabel>
                    <Controller
                      control={control}
                      name="phone"
                      render={({ field }) => (
                        <Input
                          id="phone"
                          inputMode="tel"
                          maxLength={20}
                          placeholder="(11) 99999-9999"
                          value={maskPhoneByCountry(field.value ?? "", unmaskDigits(phoneCountryCode ?? ""))}
                          onChange={(e) => field.onChange(unmaskDigits(e.target.value))}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
                    <Input id="email" value={initial.email ?? ""} disabled />
                  </div>
                  <ChangeEmailDialog />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Address (living profiles only) ────────────────────── */}
        {!isMemorialized && (
          <AccordionItem value="address" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
            <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
              <SectionTrigger icon={MapPin} label={t("sections.address")} />
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-6 pb-6 pt-4">
                <AddressSection
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  control={control as any}
                  setValue={setValue}
                  errors={errors}
                  prefix="address"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Social networks ───────────────────────────────────── */}
        <AccordionItem value="social" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
          <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
            <SectionTrigger icon={Globe} label={t("sections.social")} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-6 pb-6 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel htmlFor="website">{t("fields.website")}</FieldLabel>
                  <Input id="website" maxLength={250} placeholder="https://example.com" {...register("website")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="instagram">{t("fields.instagram")}</FieldLabel>
                  <Input id="instagram" maxLength={250} placeholder={t("placeholders.handleOrUrl")} {...register("instagram")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="linkedin">{t("fields.linkedin")}</FieldLabel>
                  <Input id="linkedin" maxLength={250} placeholder="linkedin.com/in/..." {...register("linkedin")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="facebook">{t("fields.facebook")}</FieldLabel>
                  <Input id="facebook" maxLength={250} placeholder="facebook.com/..." {...register("fb")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="x">{t("fields.x")}</FieldLabel>
                  <Input id="x" maxLength={250} placeholder={t("placeholders.handleOrUrl")} {...register("x")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="tiktok">{t("fields.tiktok")}</FieldLabel>
                  <Input id="tiktok" maxLength={250} placeholder={t("placeholders.handleOrUrl")} {...register("tiktok")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="youtube">{t("fields.youtube")}</FieldLabel>
                  <Input id="youtube" maxLength={250} placeholder="youtube.com/..." {...register("youtube")} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="other-social">{t("fields.otherSocial")}</FieldLabel>
                  <Input id="other-social" maxLength={250} placeholder={t("placeholders.otherLink")} {...register("otherSocial")} />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Notes ────────────────────────────────────────────── */}
        <AccordionItem value="notes" className="glass-card no-sheen border-0 rounded-2xl overflow-hidden">
          <AccordionTrigger className="px-6 py-4 text-base font-medium hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60">
            <SectionTrigger icon={FileText} label={t("sections.notes")} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-6 pb-6 pt-4 space-y-2">
              <FieldLabel htmlFor="notes" className="sr-only">{t("sections.notes")}</FieldLabel>
              <Textarea
                id="notes"
                maxLength={1000}
                placeholder={t("placeholders.notes")}
                className="min-h-[120px] text-base leading-relaxed resize-none"
                {...register("notes")}
              />
              <p className="text-xs text-muted-foreground">{t("notes.notPublic")}</p>
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-border/60">
        <div className="order-1 md:order-2 md:ml-auto flex flex-col md:flex-row gap-2 md:gap-3">
          <Button type="submit" className="gap-2 w-full md:w-auto order-1 md:order-2" disabled={isPending || uploading}>
            <Save className="h-4 w-4" />{tc("save")}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="gap-2 w-full md:w-auto order-2 md:order-1" disabled={isPending}>
            <RotateCcw className="h-4 w-4" />{t("actions.reset")}
          </Button>
        </div>
        {isMemorialized && (
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
                    {t("delete.description", { name: `${firstName} ${lastName}` })}
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
        )}
      </div>
    </form>
  )
}
