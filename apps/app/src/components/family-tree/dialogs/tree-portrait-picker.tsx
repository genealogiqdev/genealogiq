'use client'

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2, Trash2, User } from "lucide-react"
import { useTranslations } from "next-intl"
import { uploadMedia } from "@genealogiq/core"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { compressImage } from "@/lib/image-compress"
import { IMAGE_FORMATS_LABEL, isAllowedImage } from "@/lib/upload-validation"

interface Props {
  value: string | null
  name: string
  initials: string
  clientPayload: { profileId: string } | { scope: "create-pet" | "create-ghost" }
  disabled?: boolean
  onChange: (url: string | null) => void
  onUploadingChange?: (uploading: boolean) => void
}

export function TreePortraitPicker({
  value,
  name,
  initials,
  clientPayload,
  disabled,
  onChange,
  onUploadingChange,
}: Props) {
  const t = useTranslations("FamilyTree")
  const tc = useTranslations("Common")
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const uploadedUrlRef = useRef<string | null>(null)
  const uploadedPayloadRef = useRef<Props["clientPayload"] | null>(null)
  const [preview, setPreview] = useState<string | null>(value)
  const [uploading, setUploading] = useState(false)

  useEffect(() => setPreview(value), [value])
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    if (uploadedUrlRef.current && uploadedPayloadRef.current) {
      void discardUpload(uploadedUrlRef.current, uploadedPayloadRef.current)
    }
  }, [])

  const setBusy = (busy: boolean) => {
    setUploading(busy)
    onUploadingChange?.(busy)
  }

  const handleFile = async (file: File) => {
    if (!isAllowedImage(file)) {
      toast.error(t("portrait.unsupportedFile", { formats: IMAGE_FORMATS_LABEL }))
      return
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = URL.createObjectURL(file)
    setPreview(objectUrlRef.current)
    setBusy(true)
    try {
      const previousUpload = uploadedUrlRef.current
      const previousPayload = uploadedPayloadRef.current
      const payload = await compressImage(file, { maxDim: 512 })
      const uploaded = await uploadMedia(`portrait/${payload.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/bio/upload",
        contentType: payload.type,
        clientPayload: JSON.stringify(clientPayload),
      })
      uploadedUrlRef.current = uploaded.url
      uploadedPayloadRef.current = clientPayload
      onChange(uploaded.url)
      setPreview(uploaded.url)
      if (previousUpload && previousPayload) {
        await discardUpload(previousUpload, previousPayload)
      }
    } catch (error) {
      setPreview(value)
      toast.error(error instanceof Error ? error.message : t("portrait.uploadError"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-16 w-16 shrink-0 ring-2 ring-border/50">
        {preview && <AvatarImage src={preview} alt={name || t("portrait.alt")} />}
        <AvatarFallback className="text-sm font-semibold">
          {initials || <User className="h-5 w-5" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {uploading ? t("portrait.uploading") : t("portrait.change")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={disabled || uploading}
            onClick={() => {
              if (uploadedUrlRef.current && uploadedPayloadRef.current) {
                void discardUpload(uploadedUrlRef.current, uploadedPayloadRef.current)
                uploadedUrlRef.current = null
                uploadedPayloadRef.current = null
              }
              setPreview(null)
              onChange(null)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {tc("remove")}
          </Button>
        )}
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.target.value = ""
          }}
        />
      </div>
    </div>
  )
}

async function discardUpload(
  url: string,
  clientPayload: Props["clientPayload"],
): Promise<void> {
  await fetch("/api/bio/upload", {
    method: "DELETE",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, clientPayload: JSON.stringify(clientPayload) }),
  }).catch(() => undefined)
}
