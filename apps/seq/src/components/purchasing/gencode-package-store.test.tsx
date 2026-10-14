// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { GenCodePackageStore } from './gencode-package-store'

const { purchase, push, error } = vi.hoisted(() => ({ purchase: vi.fn(), push: vi.fn(), error: vi.fn() }))
vi.mock('@/actions/gencode-package.actions', () => ({ purchaseGenCodePackage: purchase }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { error } }))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(available = true) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>
      <GenCodePackageStore offer={{ unitPrice: 150, currency: 'BRL', minimumQuantity: 20, available }} />
    </NextIntlClientProvider>,
  ))
}
const text = () => container.textContent!.replace(/\u00a0/g, ' ')
const summary = () => container.querySelector('[aria-live]')!.textContent!.replace(/\u00a0/g, ' ')
const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!
async function setQuantity(value: string) {
  const input = container.querySelector<HTMLInputElement>('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function buy() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('GenCode package selection', () => {
  it('starts at 20 units for R$3,000 and applies 10% exactly at 50', async () => {
    await render()
    expect(summary()).toContain('20 unidades')
    expect(summary()).toContain('R$ 3.000,00')
    expect(summary()).not.toContain('Cupom')
    const fifty = Array.from(container.querySelectorAll('button')).find((button) => button.textContent!.startsWith('50 unidades'))!
    await act(async () => fifty.click())
    expect(fifty.getAttribute('aria-pressed')).toBe('true')
    expect(summary()).toContain('R$ 135,00')
    expect(summary()).toContain('Cupom de 10%')
    expect(summary()).toContain('−R$ 750,00')
    expect(summary()).toContain('R$ 6.750,00')
  })

  it('supports custom quantities and removes the discount when returning below 50', async () => {
    await render()
    await setQuantity('51')
    expect(summary()).toContain('51 unidades')
    expect(summary()).toContain('R$ 6.885,00')
    await setQuantity('49')
    expect(summary()).toContain('R$ 7.350,00')
    expect(summary()).not.toContain('Cupom')
  })

  it.each(['19', '20.5', ''])('blocks an invalid quantity %s', async (quantity) => {
    await render()
    await setQuantity(quantity)
    expect(submit().disabled).toBe(true)
    expect(container.querySelector('input')!.getAttribute('aria-invalid')).toBe('true')
    await buy()
    expect(purchase).not.toHaveBeenCalled()
  })

  it('sends only the selected quantity and navigates to the server checkout URL', async () => {
    await render()
    await setQuantity('50')
    purchase.mockResolvedValue({ ok: true, data: { url: 'https://checkout.stripe.test/paid' } })
    await buy()
    expect(purchase).toHaveBeenCalledWith({ quantity: 50 })
    expect(push).toHaveBeenCalledWith('https://checkout.stripe.test/paid')
  })

  it('keeps selection and reports payment failure without navigating', async () => {
    await render()
    purchase.mockResolvedValue({ ok: false, message: 'Pagamento indisponível' })
    await buy()
    expect(error).toHaveBeenCalledWith('Pagamento indisponível')
    expect(push).not.toHaveBeenCalled()
    expect(submit().disabled).toBe(false)
    expect(summary()).toContain('20 unidades')
  })

  it('shows a useful unavailable state while keeping the price preview', async () => {
    await render(false)
    expect(submit().disabled).toBe(true)
    expect(text()).toContain('temporariamente indisponível')
    expect(summary()).toContain('R$ 3.000,00')
  })
})
