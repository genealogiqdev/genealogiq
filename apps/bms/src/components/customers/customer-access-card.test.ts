// @vitest-environment happy-dom

import { act } from 'react'
import { jsx } from 'react/jsx-runtime'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { CustomerAccessCard } from './customer-access-card'

const { resend } = vi.hoisted(() => ({ resend: vi.fn() }))
vi.mock('@/actions/customer.actions', () => ({ resendCustomerEmail: resend }))

let container: HTMLDivElement
let root: Root
const owner = { email: 'owner@genealogiq.test', isActive: true }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  resend.mockResolvedValue({ ok: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(accessOwner: typeof owner | null = owner) {
  await act(async () => {
    root.render(jsx(NextIntlClientProvider, { locale: 'pt-BR', timeZone: 'UTC', messages,
      children: jsx(CustomerAccessCard, { id: 'partner-existing', owner: accessOwner }),
    }))
  })
  return container.querySelector('button')!
}

describe('existing partner access email', () => {
  it('shows the administrator and explains the new link without sending on load', async () => {
    const button = await render()
    expect(button.textContent).toBe('Reenviar acesso ao SEQUOIA')
    expect(button.type).toBe('button')
    expect(container.textContent).toContain('Administrador: owner@genealogiq.test')
    expect(container.textContent).toContain('O link vale por 72 horas e substitui os anteriores.')
    expect(container.textContent).toContain('A senha atual continua válida até o cliente definir outra.')
    expect(resend).not.toHaveBeenCalled()
  })

  it('resends only the selected partner and shows success with the recipient', async () => {
    const button = await render()
    await act(async () => button.click())
    expect(resend).toHaveBeenCalledExactlyOnceWith('partner-existing')
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe('E-mail de acesso ao SEQUOIA reenviado para owner@genealogiq.test.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('disables repeat clicks while the send is pending', async () => {
    let finish!: (result: { ok: boolean }) => void
    resend.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const button = await render()
    await act(async () => button.click())
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Enviando e-mail…')
    await act(async () => button.click())
    expect(resend).toHaveBeenCalledOnce()
    await act(async () => finish({ ok: true }))
    expect(button.disabled).toBe(false)
  })

  it('shows a delivery failure and allows retry without showing success prematurely', async () => {
    resend.mockResolvedValueOnce({ ok: false, message: 'Falha ao enviar o e-mail.' })
    const button = await render()
    await act(async () => button.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Falha ao enviar o e-mail.')
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    expect(resend.mock.calls).toEqual([['partner-existing'], ['partner-existing']])
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('handles a connection error and restores the button', async () => {
    resend.mockRejectedValueOnce(new Error('Connection lost'))
    const button = await render()
    await act(async () => button.click())
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('Não foi possível reenviar o e-mail. Tente novamente.')
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(button.disabled).toBe(false)
  })

  it.each([
    [null, 'Este cliente ainda não possui um administrador cadastrado.'],
    [{ ...owner, isActive: false }, 'O acesso do administrador está inativo. Ative-o antes de reenviar o e-mail.'],
  ] as const)('does not offer sending for unavailable access: %s', async (accessOwner, reason) => {
    const button = await render(accessOwner)
    expect(button.disabled).toBe(true)
    expect(container.textContent).toContain(reason)
    await act(async () => button.click())
    expect(resend).not.toHaveBeenCalled()
  })
})
