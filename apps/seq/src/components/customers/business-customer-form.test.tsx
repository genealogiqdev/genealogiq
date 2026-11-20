// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pt from '../../../messages/pt-BR.json'
import en from '../../../messages/en-US.json'
import es from '../../../messages/es-MX.json'
import { BusinessCustomerForm } from './business-customer-form'

const mocks = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('@/actions/business-customer.actions', () => ({ saveBusinessCustomer: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/address/address-section', () => ({ AddressSection: () => null }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.save.mockResolvedValue({ ok: true, message: 'saved' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const company = { name: 'Example Memorial', tradeName: '', taxId: '11222333000181', contactName: '', email: '', phoneCountryCode: '55', phone: '', notes: '', isActive: true }
async function render(messages = pt, locale = 'pt-BR', segment?: string) {
  await act(async () => root.render(
    <NextIntlClientProvider locale={locale} timeZone="UTC" messages={messages}>
      <BusinessCustomerForm id={segment ? 'company' : undefined} defaultValues={segment ? { ...company, segment } : undefined} />
    </NextIntlClientProvider>,
  ))
  return container.querySelector<HTMLSelectElement>('#business-segment')!
}
async function submit() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('B2B buyer segment field', () => {
  it.each([
    { locale: 'pt-BR', messages: pt, labels: ['Cemitérios', 'Crematórios', 'Memoriais', 'Funerárias'] },
    { locale: 'en-US', messages: en, labels: ['Cemeteries', 'Crematoriums', 'Memorials', 'Funeral homes'] },
    { locale: 'es-MX', messages: es, labels: ['Cementerios', 'Crematorios', 'Memoriales', 'Funerarias'] },
  ])('offers only the four buyer segments in $locale', async ({ locale, messages, labels }) => {
    const select = await render(messages, locale)
    expect(Array.from(select.options, option => option.value)).toEqual(['CEMETERY', 'CREMATORIUM', 'MEMORIAL', 'FUNERAL_HOME'])
    expect(Array.from(select.options, option => option.textContent)).toEqual(labels)
    expect(select.value).toBe('CEMETERY')
  })

  it.each(['CEMETERY', 'CREMATORIUM', 'MEMORIAL', 'FUNERAL_HOME'])('keeps the saved %s segment when editing', async segment => {
    const select = await render(pt, 'pt-BR', segment)
    expect(select.value).toBe(segment)
    await submit()
    expect(mocks.save).toHaveBeenCalledWith('company', { ...company, segment })
  })

  it.each(['PLAQUE_PRINTER', 'MARBLE_SHOP', 'FUNERAL_SUPPLIES', 'URN_MANUFACTURER', 'OTHER'])('requires an explicit buyer choice for the legacy %s record', async segment => {
    const select = await render(pt, 'pt-BR', segment)
    expect(select.value).toBe('')
    expect(select.selectedOptions[0].disabled).toBe(true)
    expect(select.selectedOptions[0].textContent).toBe('Selecione o segmento da empresa')
    expect(Array.from(select.options).filter(option => !option.disabled).map(option => option.textContent)).toEqual(['Cemitérios', 'Crematórios', 'Memoriais', 'Funerárias'])
    await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Obrigatório')

    await act(async () => {
      select.value = 'MEMORIAL'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await submit()
    expect(mocks.save).toHaveBeenCalledWith('company', { ...company, segment: 'MEMORIAL' })
    expect(mocks.push).toHaveBeenCalledWith('/customers?type=business')
  })
})
