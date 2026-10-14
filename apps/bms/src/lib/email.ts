// Canonical templates + transport live in @genealogiq/email. This adapter keeps
// the app's call signatures and injects the right base URL per target app.
import {
  sendVerificationEmail as _verify,
  sendEmailChangeEmail as _change,
  sendPasswordResetEmail as _reset,
  sendAccountDeletionEmail as _delete,
  sendWelcomeEmail as _welcome,
  sendFeedbackEmail as _feedback,
  sendSalePaymentLinkEmail as _paymentLink,
  sendPartnerCredentialsEmail as _partnerCredentials,
  sendConsumerPremiumEmail as _consumerPremium,
  type ConsumerPremiumEmail,
  type FeedbackEmail,
} from "@genealogiq/email"

const BMS = () => process.env.BMS_URL ?? ""
const APP = () => process.env.APP_URL ?? ""

function emailOrigin(name: 'SEQUOIA_URL' | 'APP_URL' | 'BMS_URL'): string {
  try {
    const url = new URL(process.env[name]?.trim() ?? '')
    if (['http:', 'https:'].includes(url.protocol) && url.pathname === '/' &&
        !url.username && !url.password && !url.search && !url.hash) return url.origin
  } catch {
    // Do not include the configured value in errors or fall back to another app.
  }
  throw new Error(`${name} must be a valid HTTP(S) origin`)
}

const SEQUOIA = () => {
  const origin = emailOrigin('SEQUOIA_URL')
  // Partner credentials belong to SEQ staff, not to APP consumer or BMS accounts.
  const otherOrigins = [emailOrigin('APP_URL'), emailOrigin('BMS_URL')]
  if (otherOrigins.includes(origin)) {
    throw new Error('SEQUOIA_URL must differ from APP_URL and BMS_URL')
  }
  return origin
}

// Site-owner inbox for the footer's "Report a bug" / "Send feedback" dialogs —
// never client-controllable (not part of the submitted form/schema).
const FEEDBACK_TO = "douglas@rohling.com.br"

export const sendVerificationEmail   = (to: string, token: string) => _verify({ to, token, baseUrl: BMS() })
export const sendEmailChangeEmail    = (to: string, token: string) => _change({ to, token, baseUrl: BMS() })
export const sendPasswordResetEmail  = (to: string, token: string) => _reset({ to, token, baseUrl: BMS() })
export const sendAccountDeletionEmail = (to: string) => _delete({ to })
export const sendWelcomeEmail        = (to: string, token: string) => _welcome({ to, token, baseUrl: BMS() })
export const sendSequoiaWelcomeEmail = (to: string, token: string) => _welcome({ to, token, baseUrl: SEQUOIA(), productName: "Sequoia" })
export const sendSalePaymentLinkEmail = _paymentLink
export const sendPartnerCredentialsEmail = (to: string, password: string, initialGenCodes: number) =>
  _partnerCredentials({ to, password, initialGenCodes, baseUrl: SEQUOIA() })
export const sendConsumerPremiumEmail = (data: Omit<ConsumerPremiumEmail, 'baseUrl'>) =>
  _consumerPremium({ ...data, baseUrl: APP() })

export const sendFeedback = (data: Omit<FeedbackEmail, "to">) => _feedback({ ...data, to: FEEDBACK_TO })
