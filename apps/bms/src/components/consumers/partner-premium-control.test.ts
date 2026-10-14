// @vitest-environment happy-dom
import { act } from 'react'
import { jsx } from 'react/jsx-runtime'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { PartnerPremiumControl } from './partner-premium-control'

const { grant, revoke, refresh } = vi.hoisted(() => ({ grant: vi.fn(), revoke: vi.fn(), refresh: vi.fn() }))
vi.mock('@/actions/partner-consumer.actions', () => ({ grantPartnerPremium: grant, revokePartnerPremium: revoke }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  grant.mockResolvedValue({ ok: true }); revoke.mockResolvedValue({ ok: true })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
async function render(grantId: string | null) {
  await act(async () => root.render(jsx(NextIntlClientProvider, { locale: 'pt-BR', timeZone: 'UTC', messages,
    children: jsx(PartnerPremiumControl, { appUserId: 'customer-a', consumerName: 'Ana Silva', grantId, canGrant: true }),
  })))
  await act(async () => container.querySelector('button')!.click())
  return document.querySelector<HTMLElement>('[role="dialog"]')!
}
function button(dialog: HTMLElement, text: string) {
  return [...dialog.querySelectorAll('button')].find((element) => element.textContent === text)!
}
describe('Premium confirmation in both operator apps', () => {
  it('identifies the customer, preserves stock and lets the operator cancel without mutation', async () => {
    const dialog = await render('original-gift')
    expect(dialog.textContent).toContain('Ana Silva')
    expect(dialog.textContent).toContain('não modifica a venda nem o saldo de GenCodes')
    await act(async () => button(dialog, 'Cancelar').click())
    expect(revoke).not.toHaveBeenCalled(); expect(grant).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled()
  })
  it('revokes only the confirmed grant after explicit confirmation', async () => {
    const dialog = await render('original-gift')
    await act(async () => button(dialog, 'Desativar Premium').click())
    expect(revoke).toHaveBeenCalledExactlyOnceWith('customer-a', 'original-gift')
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('keeps a failed grant open and reuses the same request identity on retry', async () => {
    grant.mockResolvedValueOnce({ ok: false, message: 'Falha de teste' })
    const dialog = await render(null)
    await act(async () => button(dialog, 'Ativar Premium').click())
    expect(dialog.textContent).toContain('Falha de teste'); expect(refresh).not.toHaveBeenCalled()
    await act(async () => button(dialog, 'Ativar Premium').click())
    expect(grant.mock.calls).toHaveLength(2)
    expect(grant.mock.calls[0]).toEqual(grant.mock.calls[1])
    expect(refresh).toHaveBeenCalledOnce()
  })
})
