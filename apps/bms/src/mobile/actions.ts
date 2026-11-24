import 'server-only'

import { getTranslations } from 'next-intl/server'
import { args, form, type MobileAction } from '@genealogiq/auth/mobile'
import { fail, ok, type ActionResult } from '@genealogiq/core'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { consumeEmailToken } from '@/lib/verify-email'
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  requestEmailChange,
  resetPassword,
} from '@/actions/auth'
import { updateCompany } from '@/actions/company.actions'
import { linkConsumerPartner } from '@/actions/consumer-partner.actions'
import { registerConsumer, resendConsumerAccessEmail, revokeConsumerAccess } from '@/actions/consumer.actions'
import {
  createCustomer,
  deleteCustomer,
  resendCustomerEmail,
  toggleCustomerActive,
  updateCustomer,
} from '@/actions/customer.actions'
import {
  createDiscountCoupon,
  toggleDiscountCouponActive,
  updateDiscountCoupon,
} from '@/actions/discount-coupon.actions'
import { syncExtraUnitPriceWithStripe, updateExtraUnitPrice } from '@/actions/extra-unit-price.actions'
import { sendFeedback } from '@/actions/feedback.actions'
import { sendGenCodePackageLink, syncGenCodePackageWithStripe } from '@/actions/gencode-package.actions'
import { applyManualCoupon, retryManualCouponEmail } from '@/actions/manual-coupon.actions'
import { grantPartnerPremium, revokePartnerPremium } from '@/actions/partner-consumer.actions'
import {
  createPartnerPlan,
  sendPartnerPlanLink,
  syncPartnerPlan,
  togglePartnerPlanActive,
  updatePartnerPlan,
} from '@/actions/partner-plan.actions'
import { updateAvatar, updateProfile } from '@/actions/profile.actions'
import {
  createSubscription,
  deleteSubscription,
  syncSubscriptionWithStripe,
  toggleSubscriptionActive,
  updateSubscription,
} from '@/actions/subscription.actions'
import {
  createUser,
  deleteUser,
  resendWelcomeEmail,
  toggleUserActive,
  updateUser,
} from '@/actions/user.actions'

/**
 * Mobile write registry: the web's server actions, unchanged.
 *
 * Every wrapped action keeps its own guard (verifySession / verifyAdmin /
 * verifyConsumerAdmin), validation and audit. The only thing added here is a
 * shape check on the positional JSON arguments, so an identifier is always a
 * string before it reaches a query — the typed signatures promise that to the
 * actions, and JSON does not.
 */

type AnyAction = (...a: never[]) => Promise<unknown>
type ArgKind = 'string' | 'string?' | 'object'

function matches(kind: ArgKind, value: unknown): boolean {
  if (kind === 'string') return typeof value === 'string'
  if (kind === 'string?') return value === undefined || value === null || typeof value === 'string'
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function invalidData(): Promise<ActionResult> {
  const t = await getTranslations('Actions')
  return fail(t('common.invalidData'))
}

/** `fn(...args)` with exactly the declared positional shape; extras are dropped. */
function call<F extends AnyAction>(fn: F, ...kinds: ArgKind[]): MobileAction {
  const run = args(fn)
  return async (input, request) => {
    const list = input.args.slice(0, kinds.length)
    if (!kinds.every((kind, index) => matches(kind, list[index]))) return invalidData()
    return run({ ...input, args: list }, request)
  }
}

/** JSON carries `redeemBy` as an ISO string; the coupon schema validates a Date. */
function reviveRedeemBy(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const redeemBy = (data as { redeemBy?: unknown }).redeemBy
  return typeof redeemBy === 'string' ? { ...data, redeemBy: new Date(redeemBy) } : data
}

const createDiscountCouponAction = call(createDiscountCoupon, 'object')

/**
 * What /verify-email does with the token in its link. Public like the page;
 * limited per address because, unlike a page view, this is a scriptable JSON
 * endpoint.
 */
const verifyEmail: MobileAction = async ({ form: data }): Promise<ActionResult<{ status: 'changed' | 'verified' }>> => {
  const token = data.get('token')
  if (typeof token !== 'string' || !token || token.length > 512) return invalidData()

  const ip = await getClientIp()
  const limit = await checkRateLimit({ key: `verify-email:ip:${ip}`, maxAttempts: 10, windowSeconds: 3600 })
  if (!limit.allowed) {
    const t = await getTranslations('Actions')
    return fail(t('auth.tooManyAttempts', { minutes: Math.ceil(limit.retryAfter / 60) }))
  }

  const outcome = await consumeEmailToken(token)
  if (outcome === 'invalid') {
    const authText = await getTranslations('Auth')
    return fail(authText('verify.invalidDescription'))
  }
  return ok({ status: outcome })
}

export const actions: Record<string, MobileAction> = {
  // Account (form fields, as the web's useActionState forms post them)
  forgotPassword: form(forgotPassword),          // { email }
  resetPassword: form(resetPassword),            // { token, password }
  verifyEmail,                                   // { token }
  changePassword: form(changePassword),          // { currentPassword, newPassword }
  requestEmailChange: form(requestEmailChange),  // { newEmail, currentPassword }
  deleteAccount: form(deleteAccount),            // { currentPassword }

  // Profile
  updateProfile: call(updateProfile, 'object'),
  updateAvatar: call(updateAvatar, 'string'),
  sendFeedback: call(sendFeedback, 'object'),

  // Company
  updateCompany: call(updateCompany, 'string', 'object'),

  // Staff
  createUser: call(createUser, 'object'),
  updateUser: call(updateUser, 'string', 'object'),
  deleteUser: call(deleteUser, 'string'),
  toggleUserActive: call(toggleUserActive, 'string'),
  resendWelcomeEmail: call(resendWelcomeEmail, 'string'),

  // Partners
  createCustomer: call(createCustomer, 'object'),
  updateCustomer: call(updateCustomer, 'string', 'object'),
  deleteCustomer: call(deleteCustomer, 'string'),
  resendCustomerEmail: call(resendCustomerEmail, 'string'),
  toggleCustomerActive: call(toggleCustomerActive, 'string'),

  // APP customers
  registerConsumer: call(registerConsumer, 'object'),
  resendConsumerAccessEmail: call(resendConsumerAccessEmail, 'string'),
  revokeConsumerAccess: call(revokeConsumerAccess, 'string'),
  linkConsumerPartner: call(linkConsumerPartner, 'string', 'string'),
  grantPartnerPremium: call(grantPartnerPremium, 'string', 'string'),
  revokePartnerPremium: call(revokePartnerPremium, 'string', 'string'),

  // Consumer pricing
  createSubscription: call(createSubscription, 'object'),
  updateSubscription: call(updateSubscription, 'string', 'object'),
  deleteSubscription: call(deleteSubscription, 'string'),
  toggleSubscriptionActive: call(toggleSubscriptionActive, 'string'),
  syncSubscriptionWithStripe: call(syncSubscriptionWithStripe, 'string'),
  updateExtraUnitPrice: call(updateExtraUnitPrice, 'string', 'object'),
  syncExtraUnitPriceWithStripe: call(syncExtraUnitPriceWithStripe, 'string'),

  // Partner plans and contracts
  createPartnerPlan: call(createPartnerPlan, 'object'),
  updatePartnerPlan: call(updatePartnerPlan, 'string', 'object'),
  togglePartnerPlanActive: call(togglePartnerPlanActive, 'string'),
  syncPartnerPlan: call(syncPartnerPlan, 'string'),
  sendPartnerPlanLink: call(sendPartnerPlanLink, 'string', 'string', 'string', 'string?'),

  // GenCode packages
  syncGenCodePackageWithStripe: call(syncGenCodePackageWithStripe, 'string'),
  sendGenCodePackageLink: call(sendGenCodePackageLink, 'object'),

  // Discount coupons
  createDiscountCoupon: (input, request) =>
    createDiscountCouponAction({ ...input, args: [reviveRedeemBy(input.args[0])] }, request),
  updateDiscountCoupon: call(updateDiscountCoupon, 'string', 'object'),
  toggleDiscountCouponActive: call(toggleDiscountCouponActive, 'string'),
  applyManualCoupon: call(applyManualCoupon, 'object'),
  retryManualCouponEmail: call(retryManualCouponEmail, 'string'),
}

/** Reachable without a token: the three steps a signed-out person can take. */
export const publicActions: readonly string[] = ['forgotPassword', 'resetPassword', 'verifyEmail']
