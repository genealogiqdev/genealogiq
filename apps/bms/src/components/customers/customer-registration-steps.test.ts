import { jsx } from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import messages from '../../../messages/pt-BR.json'
import { CustomerRegistrationSteps } from './customer-registration-steps'

function render(consumer: boolean, step: number) {
  return renderToStaticMarkup(jsx(NextIntlClientProvider, {
    locale: 'pt-BR', messages, timeZone: 'UTC',
    children: jsx(CustomerRegistrationSteps, { consumer, step }),
  }))
}

describe('new customer access steps', () => {
  it('directs the fourth B2C step to the guardian App account and the fifth to Premium', () => {
    const html = render(true, 3)
    const desktop = html.slice(html.indexOf('<ol'))
    expect(desktop.match(/<li\b/g)).toHaveLength(5)
    expect(desktop).toContain('Administrador / Guardião')
    expect(desktop).toContain('Acesso ao App para o administrador/guardião do perfil')
    expect(desktop).toContain('Permissões Premium')
    expect(desktop).toContain('Recursos Premium no App')
    expect(desktop).not.toContain('Sequoia')
    expect(desktop).not.toContain('Empresa')
    expect(desktop).not.toContain('Endereço')
    expect(desktop.match(/aria-current="step"/g)).toHaveLength(1)
  })

  it('retains partner administration and Sequoia module configuration', () => {
    const html = render(false, 4)
    expect(html).toContain('Empresa')
    expect(html).toContain('Endereço')
    expect(html).toContain('Responsável pela conta Sequoia')
    expect(html).toContain('Módulos Sequoia')
    expect(html).toContain('Permissões de acesso ao Sequoia')
    expect(html).not.toContain('Permissões Premium')
  })
})
