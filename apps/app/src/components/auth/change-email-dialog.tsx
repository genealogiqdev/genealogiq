'use client'

import { useState, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { requestEmailChange } from '@/actions/auth.actions'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { FieldLabel } from '@/components/ui/field'

export function ChangeEmailDialog() {
  const t = useTranslations('Auth')
  const [open, setOpen] = useState(false)
  const [state, dispatch, isPending] = useActionState(requestEmailChange, undefined)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {t('changeEmailTrigger')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('changeEmailTitle')}</DialogTitle>
          <DialogDescription>
            {t('changeEmailDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          action={dispatch}
          // Submit events bubble through the React tree even across the dialog
          // portal. Keep the profile form from cancelling this email action.
          onSubmit={(event) => event.stopPropagation()}
          className="flex flex-col gap-4"
        >
          {state && !state.ok && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state?.ok && state.message && (
            <p className="text-sm text-green-600">{state.message}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="ce-newEmail" required>{t('newEmailLabel')}</FieldLabel>
            <Input
              id="ce-newEmail"
              name="newEmail"
              type="email"
              placeholder={t('newEmailPlaceholder')}
              autoComplete="email"
              aria-invalid={!!state?.fieldErrors?.newEmail}
            />
            {state?.fieldErrors?.newEmail?.[0] && (
              <p className="text-xs text-destructive">{state.fieldErrors.newEmail[0]}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="ce-currentPassword" required>{t('currentPasswordLabel')}</FieldLabel>
            <InputGroup aria-invalid={!!state?.fieldErrors?.currentPassword}>
              <InputGroupInput
                id="ce-currentPassword"
                name="currentPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={!!state?.fieldErrors?.currentPassword}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {state?.fieldErrors?.currentPassword?.[0] && (
              <p className="text-xs text-destructive">{state.fieldErrors.currentPassword[0]}</p>
            )}
          </div>

          <Button type="submit" className="w-full mt-2" disabled={isPending}>
            {isPending ? t('changing') : t('changeEmailSubmit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
