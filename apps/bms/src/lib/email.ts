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
const SEQUOIA = () => process.env.SEQUOIA_URL ?? ""
const APP = () => process.env.APP_URL ?? ""

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
