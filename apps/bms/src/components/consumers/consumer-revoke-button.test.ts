// @vitest-environment happy-dom

import { act } from 'react'
import { jsx } from 'react/jsx-runtime'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { ConsumerRevokeButton } from './consumer-revoke-button'

const { revoke, refresh, success } = vi.hoisted(() => ({ revoke: vi.fn(), refresh: vi.fn(), success: vi.fn() }))
vi.mock('@/actions/consumer.actions', () => ({ revokeConsumerAccess: revoke }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success } }))

let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  revoke.mockResolvedValue({ ok: true, message: 'Liberação de Premium desfeita.' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(jsx(NextIntlClientProvider, { locale: 'pt-BR', timeZone: 'UTC', messages,
      children: jsx(ConsumerRevokeButton, { grantId: 'gift-original', consumerName: 'Ana Silva' }),
    }))
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function openDialog() {
  await act(async () => container.querySelector('button')!.click())
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
  expect(dialog).not.toBeNull()
  return dialog
}
function button(dialog: HTMLElement, label: string) {
  const found = Array.from(dialog.querySelectorAll('button')).find((item) => item.textContent === label)
  expect(found).toBeDefined()
  return found!
}

describe('consumer Premium cancellation confirmation', () => {
  it('names the recipient and explains the effect; keeping Premium does not revoke anything', async () => {
    const dialog = await openDialog()
    expect(dialog.textContent).toContain('O presente Premium de Ana Silva será encerrado agora.')
    expect(dialog.textContent).toContain('A conta, a senha e eventuais períodos pagos serão mantidos.')
    expect(revoke).not.toHaveBeenCalled()
    await act(async () => button(dialog, 'Manter Premium').click())
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('revokes the confirmed gift and refreshes only after success', async () => {
    const dialog = await openDialog()
    await act(async () => button(dialog, 'Desfazer Premium').click())
    expect(revoke).toHaveBeenCalledExactlyOnceWith('gift-original')
    expect(success).toHaveBeenCalledExactlyOnceWith('Liberação de Premium desfeita.')
    expect(refresh).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('keeps the confirmation open on a failure and retries the same gift', async () => {
    revoke.mockResolvedValueOnce({ ok: false, message: 'Falha ao desfazer. Tente novamente.' })
    const dialog = await openDialog()
    await act(async () => button(dialog, 'Desfazer Premium').click())
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Falha ao desfazer. Tente novamente.')
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    await act(async () => button(dialog, 'Desfazer Premium').click())
    expect(revoke.mock.calls).toEqual([['gift-original'], ['gift-original']])
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
