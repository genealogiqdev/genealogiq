import 'server-only'

import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { currencyForLocale } from '@genealogiq/core'
import type { MobileParams, MobileView } from '@genealogiq/auth/mobile'
import { prisma } from '@/lib/prisma'
import { verifySession, verifyAdmin, canViewSensitive } from '@/lib/dal'
import { verifyConsumerAdmin } from '@/lib/consumer-access'
import { getCompany } from '@/queries/company'
import { getConsumerForRegistration, getConsumerPartners, getConsumers } from '@/queries/consumers'
import { getActiveCustomers, getCustomer, getCustomerAccess, getCustomers } from '@/queries/customers'
import { getDashboardStats } from '@/queries/dashboard'
import {
  getActiveProductsForSelect,
  getDiscountCoupon,
  getDiscountCoupons,
  getSelectableCoupons,
} from '@/queries/discount-coupons'
import { getExtraUnitPrices } from '@/queries/extra-unit-prices'
import { getGenCodeCustomers, getGenCodeOrders, getGenCodePackages } from '@/queries/gencode-packages'
import { getManualCouponHistory, getManualCouponOptions } from '@/queries/manual-coupons'
import { getPartnerGenCodeOverview } from '@/queries/partner-gencodes'
import { getPartnerPlan, getPartnerPlans, getSellablePartnerPlans } from '@/queries/partner-plans'
import { getPartnerSubscription, getPartnerSubscriptions } from '@/queries/partner-subscriptions'
import {
  getChannelBreakdown,
  getGenCodeFunnel,
  getResellerBreakdown,
  getRevenueByPlan,
  getSellThrough,
  getTrialConversion,
  STALE_AFTER_DAYS,
} from '@/queries/reports'
import { getSubscription, getSubscriptions } from '@/queries/subscriptions'
import { getUser, getUsers } from '@/queries/users'
import { ENTITY_TYPES, PARTNER_SEGMENTS, customerCreateDefaultValues } from '@/schemas/customer.schema'
import { partnerPlanDefaultValues } from '@/schemas/partner-plan.schema'
import { subscriptionDefaultValues } from '@/schemas/subscription.schema'
import { ASSIGNABLE_ROLES, userDefaultValues } from '@/schemas/user.schema'

/**
 * Mobile read registry: one view per web screen-load.
 *
 * Every view opens with the SAME guard as the page it mirrors (the protected
 * layout's verifySession, the page's own verifyAdmin / verifyConsumerAdmin).
 * The queries keep their own guards and PII redaction; nothing here widens
 * what a role can read on the web.
 */

const text = (value: string | undefined): string => (typeof value === 'string' ? value : '')

function requiredId(params: MobileParams): string {
  const id = text(params.id)
  if (!id) notFound()
  return id
}

function isForbidden(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;403')
}

/** verifyConsumerAdmin's live check as a boolean; anything but its 403 still throws. */
async function isConsumerAdmin(): Promise<boolean> {
  try {
    await verifyConsumerAdmin()
    return true
  } catch (error) {
    if (isForbidden(error)) return false
    throw error
  }
}

/** The currency the web derives from the operator's language (Accept-Language on mobile). */
async function operatorCurrency() {
  return currencyForLocale(await getLocale())
}

function snapshotValue(snapshot: unknown, key: string): string | number | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

const dateInput = (date: Date | null | undefined): string => (date ? date.toISOString().slice(0, 10) : '')

export const views: Record<string, MobileView> = {
  /* ------------------------------ session ------------------------------- */

  me: async () => {
    const session = await verifySession()
    const [isAdmin, consumerAdmin] = await Promise.all([canViewSensitive(), isConsumerAdmin()])
    return {
      user: {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        image: session.user.image ?? null,
      },
      role: session.user.role,
      isAdmin,
      isConsumerAdmin: consumerAdmin,
    }
  },

  dashboard: async () => {
    await verifySession()
    return getDashboardStats()
  },

  profile: async () => {
    const session = await verifySession()
    // Explicit select: the row also holds the password hash and lockout state.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        firstName: true, lastName: true, email: true, avatarUrl: true,
        nationalId: true, birthDate: true, phoneCountryCode: true, phone: true,
        address: {
          select: {
            zip: true, street: true, number: true, complement: true,
            neighborhood: true, city: true, state: true, country: true,
          },
        },
      },
    })
    return {
      fullName: user ? `${user.firstName} ${user.lastName}`.trim() : (session.user.name ?? ''),
      email: user?.email ?? session.user.email ?? '',
      image: user?.avatarUrl ?? session.user.image ?? null,
      values: user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            nationalId: user.nationalId ?? '',
            birthDate: dateInput(user.birthDate),
            phoneCountryCode: user.phoneCountryCode,
            phone: user.phone ?? '',
            address: user.address,
          }
        : null,
    }
  },

  /* ------------------------- partners (customers) ----------------------- */

  customers: async () => {
    const session = await verifySession()
    const customers = await getCustomers()
    return { customers, role: session.user.role, isAdmin: await canViewSensitive() }
  },

  customerNew: async () => {
    await verifySession()
    return {
      entityTypes: ENTITY_TYPES,
      segments: PARTNER_SEGMENTS,
      defaults: customerCreateDefaultValues,
      canSubmit: await canViewSensitive(),
    }
  },

  customer: async (params) => {
    await verifySession()
    const id = requiredId(params)
    const customer = await getCustomer(id)
    if (!customer) notFound()
    // Null for non-privileged roles, exactly as the web hides the access card.
    const access = await getCustomerAccess(id)
    return { customer, access, canEdit: await canViewSensitive() }
  },

  /* ------------------------- APP customer directory --------------------- */

  consumers: async (params) => {
    await verifyConsumerAdmin()
    const [data, partners] = await Promise.all([
      getConsumers(text(params.q), Number(params.page ?? 1), params.status ?? 'all', text(params.tenant)),
      getConsumerPartners(),
    ])
    const now = new Date()
    return {
      total: data.total,
      page: data.page,
      pages: data.pages,
      pageSize: 25,
      status: data.status,
      tenantId: data.tenantId,
      partners,
      consumers: data.consumers.map((consumer) => {
        const active = consumer.appSales[0]
        const gift = consumer.consumerAccessGrants[0]
        // Same row decisions as the web directory table.
        const liveGift = !!gift && !gift.revokedAt && gift.expiresAt > now
          && !!gift.appSale?.currentPeriodEnd && gift.appSale.currentPeriodEnd > now
          && ['active', 'trialing'].includes(gift.appSale.status ?? '')
        const directGift = !!gift?.appSale && gift.appSale.tenantId === null
        const reachable = consumer.isActive && !!consumer.email
        const manageDirect = liveGift && directGift
        return {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          isActive: consumer.isActive,
          createdAt: consumer.createdAt,
          tenantId: consumer.tenantId,
          tenant: consumer.tenant,
          genCodesSold: consumer._count.genCodesBought,
          access: active?.currentPeriodEnd
            ? { planName: active.subscription.name, until: active.currentPeriodEnd }
            : null,
          gift: gift && directGift
            ? { id: gift.id, expiresAt: gift.expiresAt, emailSentAt: gift.emailSentAt, revokedAt: gift.revokedAt }
            : null,
          capabilities: {
            linkPartner: !consumer.tenant,
            resendAccess: manageDirect && reachable,
            revokeDirectGrantId: manageDirect && gift ? gift.id : null,
            partnerPremium: !manageDirect && consumer.tenantId
              ? {
                  canGrant: reachable,
                  revokeGrantId: liveGift && gift && gift.appSale?.tenantId === consumer.tenantId ? gift.id : null,
                }
              : null,
            grantDirect: !manageDirect && !consumer.tenantId && reachable,
          },
        }
      }),
    }
  },

  consumerNew: async (params) => {
    await verifyConsumerAdmin()
    const id = text(params.id)
    const initial = id ? await getConsumerForRegistration(id) : null
    if (id && !initial) notFound()
    return { initial, partners: await getConsumerPartners() }
  },

  /* --------------------------- consumer pricing ------------------------- */

  subscriptions: async () => {
    const session = await verifySession()
    return { subscriptions: await getSubscriptions(), role: session.user.role, isAdmin: await canViewSensitive() }
  },

  subscriptionNew: async () => {
    await verifySession()
    return { defaults: subscriptionDefaultValues, canSubmit: await canViewSensitive() }
  },

  subscription: async (params) => {
    await verifySession()
    const subscription = await getSubscription(requiredId(params))
    if (!subscription) notFound()
    return { subscription, canEdit: await canViewSensitive() }
  },

  extraUnitPrices: async () => {
    await verifySession()
    return { prices: await getExtraUnitPrices(), canEdit: await canViewSensitive() }
  },

  /* ---------------------------- GenCode packages ------------------------ */

  gencodes: async () => {
    await verifySession()
    const [packages, orders] = await Promise.all([getGenCodePackages(), getGenCodeOrders()])
    if (packages.length === 0) notFound()
    return { packages, orders, isAdmin: await canViewSensitive() }
  },

  gencodesNew: async (params) => {
    await verifyAdmin()
    const [packages, customers, coupons] = await Promise.all([
      getGenCodePackages({ sellableOnly: true, includeUnsynced: true }),
      getGenCodeCustomers(),
      getSelectableCoupons('brl'),
    ])
    if (packages.length === 0) notFound()
    return { packages, customers, coupons, initialPackageId: text(params.packageId) || null }
  },

  /* ------------------------------ partner plans ------------------------- */

  plans: async () => {
    await verifySession()
    return { plans: await getPartnerPlans(), isAdmin: await canViewSensitive() }
  },

  planNew: async () => {
    await verifySession()
    return { defaults: partnerPlanDefaultValues, canSubmit: await canViewSensitive() }
  },

  plan: async (params) => {
    await verifySession()
    const id = requiredId(params)
    const plan = await getPartnerPlan(id)
    if (!plan) notFound()
    return {
      plan,
      stripeProductId: plan.prices.find((p) => p.stripeProductId)?.stripeProductId ?? null,
      canEdit: await canViewSensitive(),
    }
  },

  /* -------------------------------- contracts --------------------------- */

  contracts: async () => {
    await verifySession()
    return { contracts: await getPartnerSubscriptions(), isAdmin: await canViewSensitive() }
  },

  contract: async (params) => {
    await verifySession()
    const id = requiredId(params)
    const contract = await getPartnerSubscription(id)
    if (!contract) notFound()
    return {
      id: contract.id,
      status: contract.status,
      autoRenew: contract.autoRenew,
      createdAt: contract.createdAt,
      founderRolloverEligible: contract.founderRolloverEligible,
      founderRolloverUsed: contract.founderRolloverUsed,
      tenant: contract.tenant,
      plan: contract.plan,
      // Only what the web cycle table prints; the frozen snapshot and provider
      // identifiers stay on the server.
      cycles: contract.cycles.map((cycle) => {
        const amount = snapshotValue(cycle.priceSnapshot, 'amountPaid')
        const currency = snapshotValue(cycle.priceSnapshot, 'currency')
        const cadence = snapshotValue(cycle.priceSnapshot, 'cadence')
        return {
          id: cycle.id,
          startAt: cycle.startAt,
          endAt: cycle.endAt,
          graceEndAt: cycle.graceEndAt,
          status: cycle.status,
          isRenewal: !!cycle.renewedFromCycleId,
          /** Cents, as charged. */
          amountPaid: amount === null || !Number.isFinite(Number(amount)) ? null : Number(amount),
          currency: currency === null ? null : String(currency),
          cadence: cadence === null ? null : String(cadence),
        }
      }),
    }
  },

  contractNew: async () => {
    await verifyAdmin()
    const currency = await operatorCurrency()
    const [tenants, plans, coupons] = await Promise.all([
      getActiveCustomers(),
      getSellablePartnerPlans(currency, true),
      getSelectableCoupons(currency),
    ])
    return {
      currency,
      tenants: tenants.map((c) => ({ id: c.id, name: c.name, taxId: c.taxId })),
      plans,
      coupons,
    }
  },

  /* ---------------------------- discount coupons ------------------------ */

  discountCoupons: async () => {
    const session = await verifySession()
    return { coupons: await getDiscountCoupons(), role: session.user.role, isAdmin: await canViewSensitive() }
  },

  discountCouponNew: async () => {
    await verifySession()
    const currency = await operatorCurrency()
    return { currency, products: await getActiveProductsForSelect(currency), canSubmit: await canViewSensitive() }
  },

  discountCoupon: async (params) => {
    await verifySession()
    const coupon = await getDiscountCoupon(requiredId(params))
    if (!coupon) notFound()
    return { coupon, canEdit: await canViewSensitive() }
  },

  discountCouponRedeem: async () => {
    await verifyAdmin()
    const currency = (await operatorCurrency()).toUpperCase()
    const [options, history] = await Promise.all([getManualCouponOptions(currency), getManualCouponHistory()])
    return { currency, options, history }
  },

  /* ------------------------------- reporting ---------------------------- */

  partnerGencodes: async (params) => {
    await verifyConsumerAdmin()
    return getPartnerGenCodeOverview(text(params.q))
  },

  reports: async () => {
    await verifySession()
    const [funnel, resellers, channels, revenueByPlan, sellThrough, trial] = await Promise.all([
      getGenCodeFunnel(),
      getResellerBreakdown(),
      getChannelBreakdown(),
      getRevenueByPlan(),
      getSellThrough(),
      getTrialConversion(),
    ])
    return { funnel, staleAfterDays: STALE_AFTER_DAYS, sellThrough, resellers, channels, revenueByPlan, trial }
  },

  /* --------------------------------- system ----------------------------- */

  company: async () => {
    await verifySession()
    const company = await getCompany()
    if (!company) notFound()
    return { company, canEdit: await canViewSensitive() }
  },

  users: async () => {
    const session = await verifySession()
    return {
      users: await getUsers(),
      currentUserId: session.user.id,
      role: session.user.role,
      isAdmin: await canViewSensitive(),
    }
  },

  userNew: async () => {
    await verifySession()
    return { roles: ASSIGNABLE_ROLES, defaults: userDefaultValues, canSubmit: await canViewSensitive() }
  },

  user: async (params) => {
    await verifySession()
    const user = await getUser(requiredId(params))
    if (!user) notFound()
    return { user, canEdit: await canViewSensitive() }
  },
}

/** Every BMS read needs a staff token. */
export const publicViews: readonly string[] = []
