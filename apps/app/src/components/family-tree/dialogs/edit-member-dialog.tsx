'use client'

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateMember } from "@/actions/family-tree.actions"
import type { TreePerson } from "@/queries/family-tree"
import { TreePortraitPicker } from "./tree-portrait-picker"

interface Props {
  open:      boolean
  onClose:   () => void
  rootId:    string
  person:    TreePerson
  onSuccess?: () => void
}

const toInputDate = (d: Date | null) => d ? new Date(d).toISOString().slice(0, 10) : ""

export function EditMemberDialog({ open, onClose, rootId, person, onSuccess }: Props) {
  const t = useTranslations("FamilyTree")
  const tc = useTranslations("Common")
  const [isPending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState(person.firstName)
  const [lastName,  setLastName]  = useState(person.lastName)
  const [maidenName, setMaidenName] = useState(person.maidenName ?? "")
  const [nickname,   setNickname]   = useState(person.nickname ?? "")
  const [gender,     setGender]     = useState<"MALE" | "FEMALE" | "OTHER" | "">((person.gender as "MALE" | "FEMALE" | "OTHER" | null) ?? "")
  const [birthDate,  setBirthDate]  = useState(toInputDate(person.birthDate))
  const [deathDate,  setDeathDate]  = useState(toInputDate(person.deathDate))
  const [birthPlace, setBirthPlace] = useState(person.birthPlace ?? "")
  const [deathPlace, setDeathPlace] = useState(person.deathPlace ?? "")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(person.avatarUrl)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const handleSave = () => {
    if (avatarUploading) {
      toast.warning(t("portrait.waitUploading"))
      return
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("toasts.nameRequired"))
      return
    }
    startTransition(async () => {
      const result = await updateMember(rootId, person.id, {
        firstName, lastName,
        maidenName: maidenName || null,
        nickname:   nickname   || null,
        gender:     gender || null,
        birthDate:  birthDate || null,
        deathDate:  deathDate || null,
        birthPlace: birthPlace || null,
        deathPlace: deathPlace || null,
        avatarUrl,
      })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t("toasts.personUpdated"))
      onClose()
      onSuccess?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending && !avatarUploading) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editMember.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <TreePortraitPicker
            value={avatarUrl}
            name={`${firstName} ${lastName}`.trim()}
            initials={`${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()}
            clientPayload={{ profileId: person.id }}
            disabled={isPending}
            onChange={setAvatarUrl}
            onUploadingChange={setAvatarUploading}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-first" required>{t("fields.firstName")}</FieldLabel>
              <Input id="e-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-last" required>{t("fields.lastName")}</FieldLabel>
              <Input id="e-last" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={64} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-maiden">{t("fields.maidenName")}</FieldLabel>
              <Input id="e-maiden" value={maidenName} onChange={(e) => setMaidenName(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-nick">{t("fields.nickname")}</FieldLabel>
              <Input id="e-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("fields.gender")}</FieldLabel>
            <Select value={gender} onValueChange={(v) => setGender(v as "MALE" | "FEMALE" | "OTHER")}>
              <SelectTrigger><SelectValue placeholder={t("fields.genderSelect")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FEMALE">{t("gender.female")}</SelectItem>
                <SelectItem value="MALE">{t("gender.male")}</SelectItem>
                <SelectItem value="OTHER">{t("gender.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-birth">{t("fields.birthDate")}</FieldLabel>
              <Input id="e-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-death">{t("fields.deathDate")}</FieldLabel>
              <Input id="e-death" type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-birthplace">{t("fields.birthPlace")}</FieldLabel>
              <Input id="e-birthplace" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="e-deathplace">{t("fields.deathPlace")}</FieldLabel>
              <Input id="e-deathplace" value={deathPlace} onChange={(e) => setDeathPlace(e.target.value)} maxLength={100} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending || avatarUploading}>{tc("cancel")}</Button>
          <Button onClick={handleSave} disabled={isPending || avatarUploading}>{isPending ? tc("saving") : tc("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
