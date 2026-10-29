// @vitest-environment happy-dom
import { act } from 'react'
import { jsx } from 'react/jsx-runtime'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { ConsumerPartnerDialog } from './consumer-partner-dialog'

const { link, refresh } = vi.hoisted(() => ({ link: vi.fn(), refresh: vi.fn() }))
vi.mock('@/actions/consumer-partner.actions', () => ({ linkConsumerPartner: link }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  link.mockResolvedValue({ ok: true })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

async function open(partners = [{ id: 'company-a', name: 'Empresa A', tradeName: 'Sequoia A' }]) {
  await act(async () => root.render(jsx(NextIntlClientProvider, { locale: 'pt-BR', timeZone: 'UTC', messages,
    children: jsx(ConsumerPartnerDialog, { appUserId: 'ana', consumerName: 'Ana Silva', partners }),
  })))
  await act(async () => container.querySelector('button')!.click())
  return document.querySelector<HTMLElement>('[role="dialog"]')!
}
function button(dialog: HTMLElement, name: string) {
  return [...dialog.querySelectorAll('button')].find((element) => element.textContent === name)!
}
async function select(dialog: HTMLElement) {
  await act(async () => {
    const field = dialog.querySelector('select')!
    field.value = 'company-a'; field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('company link confirmation', () => {
  it('requires choosing a company and allows cancel without writing', async () => {
    const dialog = await open()
    expect(dialog.textContent).toContain('Ana Silva')
    expect(button(dialog, 'Confirmar vínculo').disabled).toBe(true)
    await select(dialog)
    expect(dialog.textContent).toContain('Vincular Ana Silva a Sequoia A?')
    expect(dialog.textContent).toContain('A equipe dessa empresa terá acesso')
    await act(async () => button(dialog, 'Cancelar').click())
    expect(link).not.toHaveBeenCalled()
  })
  it('submits exactly the chosen customer and company and refreshes the directory', async () => {
    const dialog = await open(); await select(dialog)
    await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(link).toHaveBeenCalledExactlyOnceWith('ana', 'company-a')
    expect(refresh).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('keeps a failed confirmation open with a retry and does not claim success', async () => {
    link.mockResolvedValueOnce({ ok: false, message: 'Empresa indisponível' })
    const dialog = await open(); await select(dialog)
    const submit = () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await act(async () => { submit() })
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('Empresa indisponível')
    expect(refresh).not.toHaveBeenCalled()
    await act(async () => { submit() })
    expect(link.mock.calls).toEqual([['ana', 'company-a'], ['ana', 'company-a']])
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('explains an empty company list and prevents submission', async () => {
    const dialog = await open([])
    expect(dialog.textContent).toContain('Nenhuma empresa ativa com acesso ao Sequoia encontrada.')
    expect(button(dialog, 'Confirmar vínculo').disabled).toBe(true)
    expect(link).not.toHaveBeenCalled()
  })
})
