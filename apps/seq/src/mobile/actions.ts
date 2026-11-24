import 'server-only'

import { args, form, type MobileAction } from '@genealogiq/auth/mobile'
import { ok, fail } from '@genealogiq/core'
import { consumeEmailToken } from '@/lib/verify-email'

import {
  forgotPassword, resetPassword, changePassword, requestEmailChange, deleteAccount,
} from '@/actions/auth'
import {
  saveBusinessCustomer, sellBusinessGenCodes, deliverBusinessGenCode, resendBusinessGenCode,
} from '@/actions/business-customer.actions'
import { updateCompany } from '@/actions/company.actions'
import { grantCustomerPremium, revokeCustomerPremium, sellCustomerGenCode } from '@/actions/customer-access.actions'
import {
  createCustomerCategory, updateCustomerCategory, deleteCustomerCategory, toggleCustomerCategoryActive,
} from '@/actions/customer-category.actions'
import {
  createCustomer, createCustomerWithDeceased, updateCustomer, deleteCustomer,
  resendCustomerEmail, toggleCustomerActive,
} from '@/actions/customer.actions'
import { updateDeceased, deleteDeceased, addGuardian, removeGuardian } from '@/actions/deceased.actions'
import { sendFeedback } from '@/actions/feedback.actions'
import { purchaseGenCodePackage } from '@/actions/gencode-package.actions'
import {
  prepareGenCodePrintBatch, markGenCodeBatchPrinted, markGenCodePrinted,
  sellGenCodeManually, sellGenCodeViaPlatform, undoGenCodeSale,
} from '@/actions/gencode.actions'
import { getCustomerMemorialQr } from '@/actions/memorial-qr.actions'
import { subscribeToPartnerPlan } from '@/actions/partner-plan.actions'
import { updateProfile, updateAvatar } from '@/actions/profile.actions'
import { markQrPrinted, markQrInstalled } from '@/actions/qr-code.actions'
import {
  createSupplierCategory, updateSupplierCategory, deleteSupplierCategory, toggleSupplierCategoryActive,
} from '@/actions/supplier-category.actions'
import { createSupplier, updateSupplier, deleteSupplier, toggleSupplierActive } from '@/actions/supplier.actions'
import { createUser, updateUser, deleteUser, toggleUserActive, resendWelcomeEmail } from '@/actions/user.actions'

/**
 * Mobile write surface for Sequoia.
 *
 * Every entry is the unchanged web server action: its own guard
 * (verifyTenantSession / verifyAdmin / verifyCustomerAccessAdmin / verifySession),
 * Zod contract and tenant scope run exactly as they do for the browser. Nothing
 * here accepts a tenant id — it always comes from the verified session.
 *
 * Not registered on purpose: `login` and `logout` (mobile uses
 * /api/mobile/v1/auth/login and discards its token) and `setupSystem`
 * (first-run bootstrap stays web-only).
 */

/**
 * What the web /verify-email page does with the emailed token. Public: the
 * holder of the single-use, one-hour token is the only authorization, exactly
 * as on the page. Input: `form: { token }` (or `args: [token]`).
 */
const verifyEmail: MobileAction = async ({ args: list, form: data }) => {
  const raw = data.get('token') ?? list[0]
  const token = typeof raw === 'string' ? raw.trim() : ''
  if (!token || token.length > 512) return fail('This verification link is not valid or has already expired.')

  const outcome = await consumeEmailToken(token)
  if (outcome === 'invalid') return fail('This verification link is not valid or has already expired.')
  return ok({ status: outcome })
}

type AnyAction = (...args: never[]) => Promise<unknown>

/**
 * The JSON body is untrusted, and the wrapped actions type their id parameters
 * as `string` without re-checking: an object in an id position would reach
 * Prisma as a filter (`{ not: "" }`). So the leading id positions are checked
 * here; the remaining `data` positions are validated by each action's Zod schema.
 */
function ids<F extends AnyAction>(count: number, fn: F): MobileAction {
  return async ({ args: list }) => {
    for (let index = 0; index < count; index++) {
      if (typeof list[index] !== 'string' || list[index] === '') return fail('Invalid data')
    }
    return (fn as unknown as (...a: unknown[]) => Promise<unknown>)(...list)
  }
}

/** `fn(id | null, data)`: the id is a string when editing and null when creating. */
function idOrNull<F extends AnyAction>(fn: F): MobileAction {
  return async ({ args: list }) => {
    const id = list[0] ?? null
    if (id !== null && (typeof id !== 'string' || id === '')) return fail('Invalid data')
    return (fn as unknown as (...a: unknown[]) => Promise<unknown>)(id, ...list.slice(1))
  }
}

export const actions: Record<string, MobileAction> = {
  // ── Account (form actions) ────────────────────────────────────────────────
  forgotPassword:     form(forgotPassword),
  resetPassword:      form(resetPassword),
  verifyEmail,
  changePassword:     form(changePassword),
  requestEmailChange: form(requestEmailChange),
  deleteAccount:      form(deleteAccount),

  // ── Profile ───────────────────────────────────────────────────────────────
  updateProfile: args(updateProfile),
  updateAvatar:  ids(1, updateAvatar),

  // ── System ────────────────────────────────────────────────────────────────
  updateCompany:      ids(1, updateCompany),
  createUser:         args(createUser),
  updateUser:         ids(1, updateUser),
  deleteUser:         ids(1, deleteUser),
  toggleUserActive:   ids(1, toggleUserActive),
  resendWelcomeEmail: ids(1, resendWelcomeEmail),

  // ── Customers (consumers) ─────────────────────────────────────────────────
  createCustomer:             args(createCustomer),
  createCustomerWithDeceased: args(createCustomerWithDeceased),
  updateCustomer:             ids(1, updateCustomer),
  deleteCustomer:             ids(1, deleteCustomer),
  resendCustomerEmail:        ids(1, resendCustomerEmail),
  toggleCustomerActive:       ids(1, toggleCustomerActive),
  grantCustomerPremium:       ids(2, grantCustomerPremium),
  revokeCustomerPremium:      ids(2, revokeCustomerPremium),
  sellCustomerGenCode:        ids(3, sellCustomerGenCode),

  // ── Customers (B2B companies) ─────────────────────────────────────────────
  saveBusinessCustomer:   idOrNull(saveBusinessCustomer),
  sellBusinessGenCodes:   ids(1, sellBusinessGenCodes),
  deliverBusinessGenCode: ids(1, deliverBusinessGenCode),
  resendBusinessGenCode:  ids(2, resendBusinessGenCode),

  // ── Memorials ─────────────────────────────────────────────────────────────
  updateDeceased:  ids(1, updateDeceased),
  deleteDeceased:  ids(1, deleteDeceased),
  addGuardian:     ids(2, addGuardian),
  removeGuardian:  ids(2, removeGuardian),
  markQrPrinted:   ids(1, markQrPrinted),
  markQrInstalled: ids(1, markQrInstalled),
  // A read that writes: the first call for a memorial consumes one GenCode and
  // its credit. It must stay a POST action and never become a (retryable,
  // prefetchable) view.
  getCustomerMemorialQr: ids(2, getCustomerMemorialQr),

  // ── Categories ────────────────────────────────────────────────────────────
  createCustomerCategory:       args(createCustomerCategory),
  updateCustomerCategory:       ids(1, updateCustomerCategory),
  deleteCustomerCategory:       ids(1, deleteCustomerCategory),
  toggleCustomerCategoryActive: ids(1, toggleCustomerCategoryActive),
  createSupplierCategory:       args(createSupplierCategory),
  updateSupplierCategory:       ids(1, updateSupplierCategory),
  deleteSupplierCategory:       ids(1, deleteSupplierCategory),
  toggleSupplierCategoryActive: ids(1, toggleSupplierCategoryActive),

  // ── Suppliers ─────────────────────────────────────────────────────────────
  createSupplier:       args(createSupplier),
  updateSupplier:       ids(1, updateSupplier),
  deleteSupplier:       ids(1, deleteSupplier),
  toggleSupplierActive: ids(1, toggleSupplierActive),

  // ── GenCode inventory ─────────────────────────────────────────────────────
  prepareGenCodePrintBatch: args(prepareGenCodePrintBatch),
  markGenCodeBatchPrinted:  args(markGenCodeBatchPrinted),
  markGenCodePrinted:       ids(1, markGenCodePrinted),
  sellGenCodeManually:      ids(1, sellGenCodeManually),
  sellGenCodeViaPlatform:   ids(1, sellGenCodeViaPlatform),
  undoGenCodeSale:          ids(1, undoGenCodeSale),

  // ── Purchasing (both return a Stripe Checkout URL in result.data.url) ─────
  subscribeToPartnerPlan: ids(2, subscribeToPartnerPlan),
  purchaseGenCodePackage: args(purchaseGenCodePackage),

  // ── Support ───────────────────────────────────────────────────────────────
  // Session-bound on the server (verifySession) and has no captcha, so the web
  // action is registered unchanged.
  sendFeedback: args(sendFeedback),
}

/** Reachable without a bearer token. Everything else requires one. */
export const publicActions: readonly string[] = ['forgotPassword', 'resetPassword', 'verifyEmail']
