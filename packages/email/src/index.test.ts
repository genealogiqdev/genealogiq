import { beforeEach, describe, expect, it, vi } from 'vitest'
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail } } }))
import { sendFeedbackEmail, sendVerificationEmail, sendPartnerCredentialsEmail, sendConsumerPremiumEmail, sendWelcomeEmail, sendNotificationEmail } from './index'
beforeEach(() => vi.resetAllMocks())
describe('transactional email contracts', () => {
  it('escapes receipt text and forwards the stable provider idempotency key', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'receipt-accepted' }, error: null })
    await sendNotificationEmail('ana@genealogiq.test', {
      subject: 'Pagamento confirmado', name: '<Ana>', paragraphs: ['<script>não</script>'],
      details: [{ label: '<Plano>', value: 'Premium & extras' }], action: { label: 'Abrir <App>', url: 'https://genealogiq.com.br/subscriptions' },
    }, 'receipt-stable-key')
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@genealogiq.com.br', to: 'ana@genealogiq.test' }), { idempotencyKey: 'receipt-stable-key' })
    const html = sendEmail.mock.calls[0][0].html
    expect(html).toContain('&lt;Ana&gt;')
    expect(html).toContain('&lt;script&gt;não&lt;/script&gt;')
    expect(html).toContain('Premium &amp; extras')
    expect(html).not.toContain('<script>')
  })
  it('does not claim acceptance without a provider message ID', async () => {
    sendEmail.mockResolvedValue({ data: null, error: null })
    await expect(sendVerificationEmail({ to: 'ana@genealogiq.test', token: 'synthetic', baseUrl: 'https://genealogiq.com.br' })).rejects.toThrow('Email delivery was rejected')
  })
  it('rejects script URLs before invoking the mail provider', () => {
    expect(() => sendNotificationEmail('ana@genealogiq.test', { subject: 'Test', name: 'Ana', paragraphs: [], action: { label: 'Open', url: 'javascript:alert(1)' } }, 'receipt-key')).toThrow('Invalid notification URL')
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('sends staff invitations from the verified Genealogiq domain with the BMS setup link', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendWelcomeEmail({ to: 'staff@genealogiq.test', token: 'synthetic-token', baseUrl: 'https://bms.genealogiq.com.br' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'no-reply@genealogiq.com.br',
      to: 'staff@genealogiq.test',
      html: expect.stringContaining('https://bms.genealogiq.com.br/reset-password?token=synthetic-token'),
    }))
    expect(sendEmail.mock.calls[0][0].html).toContain('72h')
  })
  it('delivers direct APP credentials, an exact expiry and an explicit no-charge gift', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendConsumerPremiumEmail({ to: 'ana@genealogiq.test', name: '<Ana>', password: 'fixture<&password', baseUrl: 'http://localhost:5000', expiresAt: new Date('2027-10-07T15:00:00Z') })
    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe('ana@genealogiq.test')
    expect(message.html).toContain('http://localhost:5000/sign-in')
    expect(message.html).toContain('&lt;Ana&gt;')
    expect(message.html).toContain('fixture&lt;&amp;password')
    expect(message.html).toContain('7 de outubro de 2027')
    expect(message.html).toContain('sem cobrança ou renovação automática')
    expect(message.html).not.toContain('reset-password')
  })
  it('keeps existing credentials and uses a recovery link only for an explicit resend', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendConsumerPremiumEmail({ to: 'ana@genealogiq.test', name: 'Ana', token: 'fixture-token', baseUrl: 'http://localhost:5000', expiresAt: new Date('2027-10-07T15:00:00Z') })
    const html = sendEmail.mock.calls[0][0].html
    expect(html).toContain('use sua senha atual')
    expect(html).toContain('http://localhost:5000/reset-password?token=fixture-token')
    expect(html).toContain('72h')
    expect(html).not.toContain('Senha inicial')
  })
  it('rejects a resolved provider error rather than reporting successful delivery', async () => {
    sendEmail.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Rejected' } })
    await expect(sendPartnerCredentialsEmail({ to: 'owner@genealogiq.test', password: 'fixture-password', baseUrl: 'http://localhost:3002', initialGenCodes: 3 }))
      .rejects.toThrow('Email delivery was rejected by the provider')
  })
  it('sends the login email, escaped generated password, SEQ sign-in link and exact allowance', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendPartnerCredentialsEmail({ to: 'owner@genealogiq.test', password: 'fixture<&password', baseUrl: 'http://localhost:3002', initialGenCodes: 3 })
    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe('owner@genealogiq.test')
    expect(message.html).toContain('http://localhost:3002/sign-in')
    expect(message.html).toContain('fixture&lt;&amp;password')
    expect(message.html).toContain('GenCodes iniciais disponíveis: <strong>3</strong>')
    expect(message.html).not.toContain('reset-password')
  })
  it('escapes user feedback before it reaches the HTML transport', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendFeedbackEmail({ to: 'support@genealogiq.test', type: 'feedback', message: '<script>bad & worse</script>', email: 'fixture@genealogiq.test' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@genealogiq.com.br', to: 'support@genealogiq.test', html: expect.stringContaining('&lt;script&gt;bad &amp; worse&lt;/script&gt;') }))
    expect(sendEmail.mock.calls[0][0].html).not.toContain('<script>')
  })
  it('uses the supplied app origin for a verification link', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendVerificationEmail({ to: 'fixture@genealogiq.test', token: 'synthetic-token', baseUrl: 'http://localhost:3002' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'fixture@genealogiq.test', html: expect.stringContaining('http://localhost:3002/verify-email?token=synthetic-token') }))
  })
  it('propagates a thrown transport failure', async () => {
    sendEmail.mockRejectedValue(new Error('fixture transport unavailable'))
    await expect(sendVerificationEmail({ to: 'fixture@genealogiq.test', token: 'synthetic-token', baseUrl: 'http://localhost:3002' })).rejects.toThrow('fixture transport unavailable')
  })
})
