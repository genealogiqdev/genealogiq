import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: sendEmail } },
}))

import {
  sendPartnerCredentialsEmail,
  sendSequoiaWelcomeEmail,
  sendConsumerPremiumEmail,
  sendWelcomeEmail,
} from './email'

function sentLinks(): string[] {
  return Array.from(sendEmail.mock.calls[0][0].html.matchAll(/href="([^"]+)"/g), (match: RegExpMatchArray) => match[1])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_URL', 'https://genealogiq.com.br')
  vi.stubEnv('BMS_URL', 'https://bms.genealogiq.com.br')
  vi.stubEnv('SEQUOIA_URL', 'https://sequoia.genealogiq.com.br')
  sendEmail.mockResolvedValue({ data: { id: 'fixture-message' }, error: null })
})

afterEach(() => vi.unstubAllEnvs())

describe('BMS email destinations', () => {
  it('links newly registered partner credentials exclusively to Sequoia sign-in', async () => {
    await sendPartnerCredentialsEmail('owner@genealogiq.test', 'fixture-password', 0)
    expect(sentLinks()).toEqual(['https://sequoia.genealogiq.com.br/sign-in'])
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@genealogiq.test',
      subject: 'Seu acesso ao Sequoia está disponível',
    }))
  })

  it('keeps partner resend and legacy activation password setup on Sequoia', async () => {
    await sendSequoiaWelcomeEmail('owner@genealogiq.test', 'fixture-token')
    expect(sentLinks()).toEqual(['https://sequoia.genealogiq.com.br/reset-password?token=fixture-token'])
    expect(sendEmail.mock.calls[0][0].subject).toContain('Sequoia')
  })

  it('uses the configured local Sequoia port and normalizes a trailing slash', async () => {
    vi.stubEnv('APP_URL', 'http://localhost:6000/')
    vi.stubEnv('BMS_URL', 'http://localhost:6001/')
    vi.stubEnv('SEQUOIA_URL', '  http://localhost:6002/  ')
    await sendPartnerCredentialsEmail('owner@genealogiq.test', 'fixture-password', 3)
    expect(sentLinks()).toEqual(['http://localhost:6002/sign-in'])
  })

  it('preserves the APP destination for final consumers', async () => {
    await sendConsumerPremiumEmail({
      to: 'consumer@genealogiq.test', name: 'Ana', password: 'fixture-password',
      expiresAt: new Date('2027-10-14T12:00:00Z'),
    })
    expect(sentLinks()).toEqual(['https://genealogiq.com.br/sign-in'])
  })

  it('preserves the BMS destination for back-office staff', async () => {
    await sendWelcomeEmail('staff@genealogiq.test', 'fixture-token')
    expect(sentLinks()).toEqual(['https://bms.genealogiq.com.br/reset-password?token=fixture-token'])
  })
})

describe.each([
  ['partner registration', () => sendPartnerCredentialsEmail('owner@genealogiq.test', 'fixture-password', 0)],
  ['partner resend', () => sendSequoiaWelcomeEmail('owner@genealogiq.test', 'fixture-token')],
] as const)('%s URL configuration boundary', (_name, sendMessage) => {
  it.each(['APP_URL', 'BMS_URL'] as const)('rejects an origin pointing at %s before sending credentials', (target) => {
    vi.stubEnv('SEQUOIA_URL', `${process.env[target]}/`)
    expect(sendMessage).toThrow('SEQUOIA_URL must differ from APP_URL and BMS_URL')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    '',
    '/sign-in',
    'javascript:alert(1)',
    'https://user:password@sequoia.example',
    'https://sequoia.example/another-app',
    'https://sequoia.example?redirect=https://genealogiq.com.br',
    'https://sequoia.example#app',
  ])('rejects missing or invalid Sequoia origin %s without a relative or fallback link', (value) => {
    vi.stubEnv('SEQUOIA_URL', value)
    expect(sendMessage).toThrow('SEQUOIA_URL must be a valid HTTP(S) origin')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
