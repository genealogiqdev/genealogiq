import { beforeEach, describe, expect, it, vi } from 'vitest'
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail } } }))
import { sendFeedbackEmail, sendVerificationEmail } from './index'
beforeEach(() => vi.resetAllMocks())
describe('transactional email contracts', () => {
  it('escapes user feedback before it reaches the HTML transport', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
    await sendFeedbackEmail({ to: 'support@genealogiq.test', type: 'feedback', message: '<script>bad & worse</script>', email: 'fixture@genealogiq.test' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@rohling.com.br', to: 'support@genealogiq.test', html: expect.stringContaining('&lt;script&gt;bad &amp; worse&lt;/script&gt;') }))
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
