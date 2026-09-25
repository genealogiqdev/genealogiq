"use client"

import { useCallback, useMemo, useRef, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { uploadMedia as upload } from "@genealogiq/core"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Paperclip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TurnstileWidget } from "@/components/turnstile-widget"
import { sendFeedback } from "@/actions/feedback.actions"
import { getFeedbackSchema, type FeedbackValues } from "@/schemas/feedback.schema"
import { cn } from "@/lib/utils"

interface Props {
  type: "bug" | "contact" | "career"
  label: string
  className?: string
}

const MAX_CV_SIZE = 5 * 1024 * 1024

export function FeedbackDialog({ type, label, className }: Props) {
  const t = useTranslations("Feedback")
  const tErr = useTranslations("Errors")
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [uploadingCv, setUploadingCv] = useState(false)
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const openedAtRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FeedbackValues>({
    resolver: useMemo(() => zodResolver(getFeedbackSchema(tErr)), [tErr]),
    defaultValues: { type, email: "", message: "", website: "", openedAt: 0, turnstileToken: "" },
  })

  const cvUrl = watch("cvUrl")

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      openedAtRef.current = Date.now()
      setValue("openedAt", openedAtRef.current)
    }
  }

  const handleVerify = useCallback((token: string) => setValue("turnstileToken", token), [setValue])

  const handleCvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.type !== "application/pdf") { toast.error(t("toasts.cvInvalidType")); return }
    if (file.size > MAX_CV_SIZE) { toast.error(t("toasts.cvTooLarge")); return }

    setUploadingCv(true)
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/career/upload",
        contentType: file.type,
      })
      setValue("cvUrl", blob.url)
      setCvFileName(file.name)
    } catch {
      toast.error(t("toasts.cvUploadFailed"))
    } finally {
      setUploadingCv(false)
    }
  }

  const removeCv = () => {
    setValue("cvUrl", undefined)
    setCvFileName(null)
  }

  const onSubmit = (data: FeedbackValues) => {
    startTransition(async () => {
      const result = await sendFeedback({ ...data, page: pathname })
      if (!result.ok) { toast.error(result.message); return }
      toast.success(t(`toasts.${type}Sent`))
      setOpen(false)
      setCvFileName(null)
      reset({ type, email: "", message: "", website: "", openedAt: 0, turnstileToken: "" })
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors cursor-pointer", className)}
        >
          {label}
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`dialog.${type}Title`)}</DialogTitle>
          <DialogDescription>{t(`dialog.${type}Description`)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Honeypot — visually hidden, never filled by a human. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
            {...register("website")}
          />

          <div className="space-y-2">
            <FieldLabel htmlFor={`feedback-email-${type}`} required>{t("fields.email")}</FieldLabel>
            <Input
              id={`feedback-email-${type}`}
              type="email"
              placeholder={t("fields.emailPlaceholder")}
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor={`feedback-message-${type}`} required>{t("fields.message")}</FieldLabel>
            <Textarea
              id={`feedback-message-${type}`}
              className="min-h-40"
              maxLength={2000}
              rows={10}
              placeholder={t(`fields.messagePlaceholder.${type}`)}
              {...register("message")}
            />
            {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
          </div>

          {type === "career" && (
            <div className="space-y-2">
              <FieldLabel htmlFor="feedback-cv">{t("fields.cv")}</FieldLabel>
              <input
                ref={fileInputRef}
                id="feedback-cv"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleCvChange}
              />
              {cvUrl && cvFileName ? (
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <span className="truncate">{cvFileName}</span>
                  <button
                    type="button"
                    onClick={removeCv}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("fields.cvRemove")}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingCv}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                  {uploadingCv ? t("fields.cvUploading") : t("fields.cvUpload")}
                </Button>
              )}
            </div>
          )}

          <TurnstileWidget onVerify={handleVerify} />

          <Button type="submit" className="w-full" disabled={isPending || uploadingCv}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
