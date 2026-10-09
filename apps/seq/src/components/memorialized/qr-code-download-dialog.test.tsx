// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { MemorializedDataTable } from './memorialized-data-table'

const { qr, authorize, toast } = vi.hoisted(() => ({ qr: {
  toString: vi.fn<(...args: unknown[]) => Promise<string>>(),
  toDataURL: vi.fn<(...args: unknown[]) => Promise<string>>(),
}, authorize: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('qrcode', () => ({ default: qr }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/actions/memorial-qr.actions', () => ({ getCustomerMemorialQr: authorize }))

let container: HTMLDivElement
let root: Root
let downloads: { filename: string; href: string }[]
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path d="M0 0h7v7H0z"/></svg>'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  qr.toString.mockResolvedValue(svg)
  authorize.mockResolvedValue({ ok: true, data: { profileUrl: 'https://app.example.test/profile/profile-fixture' } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-fixture')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, href: this.href })
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderTable(deathDate: Date | null, qrAccess: 'allowed' | 'premiumRequired' | 'limitReached' = 'allowed') {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>
        <MemorializedDataTable data={[{
          id: 'profile-fixture', firstName: 'Ana', lastName: 'Silva',
          birthDate: null, deathDate,
          customerId: 'customer-fixture', role: 'APP_MEMO', qrAccess,
          profileUrl: 'https://app.example.test/profile/profile-fixture',
        }]} />
      </NextIntlClientProvider>,
    )
  })
}

async function openDownload(deathDate: Date | null) {
  await renderTable(deathDate)
  const trigger = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Baixar')!
  expect(trigger).toBeDefined()
  expect(trigger.closest('a')).toBeNull()
  await act(async () => trigger.click())
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(dialog).not.toBeNull()
  expect(container.contains(dialog)).toBe(false)
  expect(dialog.textContent).toContain('Ana Silva')
  expect(dialog.textContent).toContain('https://app.example.test/profile/profile-fixture')
  return dialog
}

describe('Baixar in the customer memorial table', () => {
  it.each([null, new Date('2009-08-26T00:00:00Z')])('downloads an SVG in place for deathDate=%s', async (deathDate) => {
    const dialog = await openDownload(deathDate)

    expect(dialog.querySelectorAll('svg[viewBox="0 0 21 21"]')).toHaveLength(6)
    expect(qr.toString).toHaveBeenCalledWith('https://app.example.test/profile/profile-fixture', expect.objectContaining({ type: 'svg' }))
    const download = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'SVG')!
    await act(async () => download.click())

    expect(downloads).toEqual([{ filename: 'qr-ana-silva-classic.svg', href: 'blob:download-fixture' }])
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blob.type).toBe('image/svg+xml')
    expect(await blob.text()).toBe(svg)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-fixture')
    expect(document.querySelector('[role="dialog"]')).toBe(dialog)
    expect(container.textContent).toContain('Ana Silva')
  })

  it('prevents an empty SVG download while the QR is still being generated', async () => {
    qr.toString.mockReturnValue(new Promise(() => {}))
    const dialog = await openDownload(null)

    const buttons = Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent === 'SVG')
    expect(buttons).toHaveLength(6)
    for (const button of buttons) {
      expect(button.disabled).toBe(true)
      await act(async () => button.click())
    }
    expect(downloads).toEqual([])
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('downloads a PNG for the selected profile without navigating away', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    qr.toDataURL.mockResolvedValue(dataUrl)
    const dialog = await openDownload(null)
    const download = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'PNG')!

    await act(async () => download.click())
    await vi.waitFor(() => expect(downloads).toEqual([
      { filename: 'qr-ana-silva-classic.png', href: 'blob:download-fixture' },
    ]))

    expect(qr.toDataURL).toHaveBeenCalledWith('https://app.example.test/profile/profile-fixture', {
      errorCorrectionLevel: 'H', margin: 4, width: 1024,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blob.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(document.querySelector('[role="dialog"]')).toBe(dialog)
  })

  it.each(['premiumRequired', 'limitReached'] as const)('explains %s without offering a download', async (access) => {
    await renderTable(null, access)
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Baixar')).toBe(false)
    expect(container.textContent).toContain(access === 'premiumRequired' ? 'Disponível no Premium' : 'Limite de GenCodes atingido')
    expect(authorize).not.toHaveBeenCalled()
    expect(qr.toString).not.toHaveBeenCalled()
  })

  it('rechecks the customer and profile before every export and rejects an expired plan', async () => {
    const dialog = await openDownload(null)
    authorize.mockResolvedValueOnce({ ok: false, message: 'O Premium expirou.' })
    const download = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'PNG')!
    await act(async () => download.click())

    expect(authorize).toHaveBeenNthCalledWith(1, 'customer-fixture', 'profile-fixture')
    expect(authorize).toHaveBeenNthCalledWith(2, 'customer-fixture', 'profile-fixture')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('O Premium expirou.')
    expect(qr.toDataURL).not.toHaveBeenCalled()
    expect(downloads).toEqual([])
  })

  it('shows a retry after a preview request fails instead of an empty QR', async () => {
    authorize.mockRejectedValueOnce(new Error('Network unavailable'))
    await renderTable(null)
    const trigger = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Baixar')!
    await act(async () => trigger.click())
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('Não foi possível gerar o QR Code. Tente novamente.')
    const retry = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Tentar novamente')!
    await act(async () => retry.click())
    expect(dialog.querySelectorAll('svg[viewBox="0 0 21 21"]')).toHaveLength(6)
    expect(dialog.querySelector('[role="alert"]')).toBeNull()
  })

  it('recovers a failed SVG preview without permitting an empty file', async () => {
    qr.toString.mockRejectedValue(new Error('Renderer unavailable'))
    const dialog = await openDownload(null)
    expect(dialog.querySelectorAll('[role="alert"]')).toHaveLength(6)
    expect(Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent === 'SVG').every((button) => button.disabled)).toBe(true)
    qr.toString.mockResolvedValue(svg)
    const retry = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Tentar novamente')!
    await act(async () => retry.click())
    expect(dialog.querySelectorAll('svg[viewBox="0 0 21 21"]')).toHaveLength(1)
    expect(downloads).toEqual([])
  })

  it('reports a failed PNG export and leaves the controls available to retry', async () => {
    qr.toDataURL.mockRejectedValueOnce(new Error('Canvas failed'))
    const dialog = await openDownload(null)
    const download = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'PNG')!
    await act(async () => download.click())
    expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o QR Code. Tente novamente.')
    expect(download.disabled).toBe(false)
    expect(downloads).toEqual([])
  })
})
