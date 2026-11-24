import type { SystemId } from '@/config'
import { action } from './client'

/** Account flows that work before sign-in. The same action names exist in all three systems. */
export const authApi = {
  /** Always reports success, whether or not the email exists (no account enumeration). */
  forgotPassword: (system: SystemId, email: string) => action(system, 'forgotPassword', { form: { email } }),

  resetPassword: (system: SystemId, token: string, password: string, callbackUrl?: string | null) =>
    action(system, 'resetPassword', { form: { token, password, callbackUrl } }),

  /** Genealogiq only: staff and partner accounts are created by invitation. */
  signUp: (input: { firstName: string; lastName: string; email: string; password: string; callbackUrl?: string | null }) =>
    action('app', 'signUp', { form: input }),

  /** Confirms an account email or applies an email change from the emailed link. */
  verifyEmail: (system: SystemId, token: string) => action(system, 'verifyEmail', { args: [token], form: { token } }),
}
