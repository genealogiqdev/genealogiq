'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { uploadMedia as upload } from '@genealogiq/core'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@genealogiq/ui/avatar'
import { updateAvatar } from '@/actions/profile.actions'
import { getInitials } from '@/lib/utils'

interface AvatarUploadProps {
  defaultUrl: string
  fullName:   string
}

export function AvatarUpload({ defaultUrl, fullName }: AvatarUploadProps) {
  const t = useTranslations('Profile')
  const [url, setUrl]         = useState(defaultUrl)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()
  const { update } = useSession()

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('avatar.invalidType'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('avatar.tooLarge'))
      return
    }

    setIsUploading(true)
    try {
      const blob = await upload(`avatars/${Date.now()}-${file.name}`, file, {
        access:          'public',
        handleUploadUrl: '/api/profile/upload',
      })

      startSaving(async () => {
        const result = await updateAvatar(blob.url)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        setUrl(blob.url)
        await update({ image: blob.url })
        if (result.message) toast.success(result.message)
        router.refresh()
      })
    } catch (err) {
      toast.error((err as Error).message || t('avatar.uploadFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const busy = isUploading || isSaving

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className="relative size-20 rounded-full overflow-hidden group focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed"
      aria-label={t('avatar.change')}
    >
      <Avatar className="size-20 text-xl">
        <AvatarImage src={url} alt={fullName} />
        <AvatarFallback>{getInitials(fullName)}</AvatarFallback>
      </Avatar>
      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
        {busy ? <Loader2 className="size-5 text-white animate-spin" /> : <Camera className="size-5 text-white" />}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
    </button>
  )
}
