import 'server-only'

import { forbidden, notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { currencyForLocale } from '@genealogiq/core'
import type { MobileParams, MobileView } from '@genealogiq/auth/mobile'
import { prisma } from '@/lib/prisma'
import { canViewSensitive, getCustomerModules, verifySession, verifyTenantSession } from '@/lib/dal'
import { canManageCustomerAccess } from '@/lib/customer-access'
import { getBusinessCodeState } from '@/lib/business-code-status'
import { formatGenCode } from '@/lib/gen-code'
import { prepareGenCodePrintBatch } from '@/actions/gencode.actions'
import { getBusinessCustomer, getBusinessCustomers } from '@/queries/business-customers'
import { getCompany } from '@/queries/company'
import { getCreditOverview } from '@/queries/credits'
import { getCustomerAccess } from '@/queries/customer-access'
import { getCustomerCategories, getCustomerCategory } from '@/queries/customer-categories'
import { getCustomer, getCustomers } from '@/queries/customers'
import { getDashboardStats } from '@/queries/dashboard'
import { getDeceased } from '@/queries/deceased'
import { getLicenseByGenCode, getLicenses, getLicenseSummary } from '@/queries/licenses'
import { getGenCodePackageOffer, getGenCodePackageOrders, getPlanOrders } from '@/queries/purchasing'
import { getSupplierCategories, getSupplierCategory } from '@/queries/supplier-categories'
import { getSupplier, getSuppliers } from '@/queries/suppliers'
import { getUser, getUsers } from '@/queries/users'
import { BUSINESS_SEGMENTS, businessCustomerDefaults } from '@/schemas/business-customer.schema'

/**
 * Mobile read surface for Sequoia: one view per web screen-load.
 *
 * Rules every view follows:
 *  - It starts with `verifyTenantSession()`, the guard the (protected) layout
 *    applies to every page, then runs the page's own guard (module gates,
 *    capability checks) in the same order the page does.
 *  - The tenant always comes from the verified session. No view reads a tenant
 *    id from `params`; by-id views go through the same tenant-scoped query the
 *    page uses and answer 404 for a record outside the caller's tenant.
 *  - It returns what the page hands to its client components (including the
 *    same boolean capability flags) as plain JSON. Dates serialise as ISO
 *    strings. No password hash or token is ever selected.
 */

/** Same APP origin normalisation the customer pages use for QR targets. */
function appBaseUrl(): string {
  return (process.env.APP_URL ?? 'https://genealogiq.app').replace(/\/+$/, '')
}

/** A by-id view without its id has nothing to show — same as an unknown route. */
function required(params: MobileParams, key: string): string {
  const value = params[key]?.trim()
  if (!value) notFound()
  return value
}

async function requireSupplierModule() {
  const modules = await getCustomerModules()
  if (!modules?.moduleRecordsSuppliers) forbidden()
}

async function requireSupplierCategoryModule() {
  const modules = await getCustomerModules()
  if (!modules?.moduleCategoriesSuppliers) forbidden()
}

async function loadBusinessCustomer(id: string) {
  const customer = await getBusinessCustomer(id)
  if (!customer) notFound()
  return customer
}

async function loadBusinessSale(params: MobileParams) {
  const customer = await loadBusinessCustomer(required(params, 'customerId'))
  const saleId = required(params, 'saleId')
  const sale = customer.sales.find((row) => row.id === saleId)
  if (!sale) notFound()
  // "Available" is the same state the web lot card exports: sold to the company,
  // reservation still held, not yet delivered or activated.
  const codes = sale.genCodes.filter((code) => getBusinessCodeState(code) === 'available').map((code) => code.genCode)
  return { customer, sale, codes }
}

export const views: Record<string, MobileView> = {
  /* ── Session ──────────────────────────────────────────────────────────── */

  /** Who is signed in and what the shell may show (never an authorization). */
  me: async () => {
    const session = await verifyTenantSession()
    const [company, modules, isAdmin, canManageAccess] = await Promise.all([
      getCompany(), getCustomerModules(), canViewSensitive(), canManageCustomerAccess(),
    ])
    return {
      user: {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        image: session.user.image ?? null,
        role: session.user.role,
      },
      tenant: {
        id: session.customerId,
        name: company?.legalName ?? null,
        tradeName: company?.tradeName ?? null,
        isActive: company?.isActive ?? false,
      },
      modules: {
        suppliers: !!modules?.moduleRecordsSuppliers,
        supplierCategories: !!modules?.moduleCategoriesSuppliers,
      },
      isAdmin,
      canManageCustomerAccess: canManageAccess,
    }
  },

  /* ── /dashboard ───────────────────────────────────────────────────────── */

  dashboard: async () => {
    const { customerId } = await verifyTenantSession()
    const [stats, credits] = await Promise.all([getDashboardStats(customerId), getCreditOverview()])
    return { stats, credits }
  },

  /* ── /profile ─────────────────────────────────────────────────────────── */

  profile: async () => {
    await verifyTenantSession()
    const session = await verifySession()
    // Explicit select: the page's `include` would also load the password hash.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true,
        nationalId: true, birthDate: true, phoneCountryCode: true, phone: true,
        address: { select: {
          zip: true, street: true, number: true, complement: true,
          neighborhood: true, city: true, state: true, country: true,
        } },
      },
    })
    return {
      fullName: user ? `${user.firstName} ${user.lastName}`.trim() : (session.user.name ?? ''),
      email: user?.email ?? session.user.email ?? '',
      image: user?.avatarUrl ?? session.user.image ?? '',
      user,
    }
  },

  /* ── /purchasing ──────────────────────────────────────────────────────── */

  purchasingPlans: async () => {
    await verifyTenantSession()
    // Same catalogue rule as the page: priced in the caller's language and only
    // offered where a synced Stripe Price exists.
    const currency = currencyForLocale(await getLocale()).toUpperCase()
    const [rows, orders] = await Promise.all([
      prisma.partnerPlan.findMany({
        where: {
          isActive: true,
          prices: { some: { isActive: true, effectiveTo: null, currency, stripeCashPriceId: { not: null } } },
        },
        select: {
          id: true, name: true, code: true, annualAllowance: true,
          prices: {
            where: { isActive: true, effectiveTo: null, currency },
            select: {
              currency: true, annualCashAmount: true, unitReferenceAmount: true,
              installmentCount: true, installmentAmount: true, stripeInstallmentPriceId: true,
            },
            take: 1,
          },
        },
        orderBy: { annualAllowance: 'asc' },
      }),
      getPlanOrders(),
    ])
    const plans = rows.flatMap((row) => {
      const price = row.prices[0]
      if (!price) return []
      return [{
        id: row.id, name: row.name, code: row.code, annualAllowance: row.annualAllowance,
        currency: price.currency,
        annualCashAmount: Number(price.annualCashAmount),
        unitReferenceAmount: price.unitReferenceAmount === null ? null : Number(price.unitReferenceAmount),
        installmentCount: price.stripeInstallmentPriceId ? price.installmentCount : null,
        installmentAmount: price.stripeInstallmentPriceId && price.installmentAmount !== null
          ? Number(price.installmentAmount)
          : null,
      }]
    })
    return { currency, plans, orders }
  },

  purchasingPackages: async () => {
    await verifyTenantSession()
    const [offer, orders] = await Promise.all([getGenCodePackageOffer(), getGenCodePackageOrders()])
    return { offer, orders }
  },

  /* ── /inventory/activations ───────────────────────────────────────────── */

  /** params: status? = AVAILABLE | SOLD | ACTIVATED (anything else lists all). */
  activations: async (params) => {
    await verifyTenantSession()
    const status = params.status === 'AVAILABLE' || params.status === 'SOLD' || params.status === 'ACTIVATED'
      ? params.status
      : undefined
    const [licenses, summary] = await Promise.all([getLicenses(status), getLicenseSummary()])
    return { status: status ?? null, summary, licenses }
  },

  /** params: genCode (dashes and case are normalised like the page). */
  activation: async (params) => {
    await verifyTenantSession()
    const genCode = required(params, 'genCode').toUpperCase().replace(/-/g, '')
    const license = await getLicenseByGenCode(genCode)
    if (!license) notFound()

    const appUrl = process.env.APP_URL ?? 'https://genealogiq.app'
    return {
      genCode: license.genCode,
      formattedGenCode: formatGenCode(license.genCode),
      qrUrl: `${appUrl}/qr/${license.genCode}`,
      filename: `qr-${license.genCode.toLowerCase()}`,
      status: license.status,
      printedAt: license.printedAt,
      soldAt: license.soldAt,
      soldVia: license.soldVia,
      soldToName: license.soldToName,
      soldValue: license.soldValue != null ? Number(license.soldValue) : null,
      activatedAt: license.activatedAt,
      createdAt: license.createdAt,
      memorial: license.appUser
        ? { firstName: license.appUser.firstName, lastName: license.appUser.lastName }
        : null,
      buyer: license.soldToAppUser
        ? { firstName: license.soldToAppUser.firstName, lastName: license.soldToAppUser.lastName, email: license.soldToAppUser.email ?? '' }
        : null,
      soldByName: license.soldBy ? `${license.soldBy.firstName} ${license.soldBy.lastName}` : null,
    }
  },

  /**
   * Stock print batch as data (the web renders it to an HTML sheet in the
   * browser). Read-only: nothing is marked printed until the
   * `markGenCodeBatchPrinted` action. params: quantity (1–100).
   */
  stockPrintBatch: async (params) => {
    await verifyTenantSession()
    const result = await prepareGenCodePrintBatch(Number(params.quantity))
    if (!result.ok || !result.data) {
      return { ok: false, message: result.ok ? '' : result.message, appBaseUrl: null, codes: [] }
    }
    const base = result.data.appBaseUrl.replace(/\/$/, '')
    return {
      ok: true,
      message: '',
      appBaseUrl: base,
      codes: result.data.codes.map((genCode) => ({ genCode, url: `${base}/qr/${encodeURIComponent(genCode)}` })),
    }
  },

  /* ── /customers ───────────────────────────────────────────────────────── */

  /** Consumer tab. */
  customers: async () => {
    await verifyTenantSession()
    const [customers, canManageAccess] = await Promise.all([getCustomers(), canManageCustomerAccess()])
    return { customers, canManageAccess }
  },

  /** Business (B2B) tab. */
  businessCustomers: async () => {
    await verifyTenantSession()
    const companies = await getBusinessCustomers()
    return {
      companies: companies.map(({ sales, ...company }) => {
        const states = sales.flatMap((sale) => sale.genCodes.map((code) => getBusinessCodeState(code)))
        return {
          ...company,
          genCodesSold: states.filter((state) => state !== 'returned').length,
          available: states.filter((state) => state === 'available').length,
          assigned: states.filter((state) => state === 'assigned').length,
          activated: states.filter((state) => state === 'activated').length,
        }
      }),
    }
  },

  /** /customers/new prerequisites. */
  customerNew: async () => {
    await verifyTenantSession()
    const [categories, canManageAccess] = await Promise.all([getCustomerCategories(), canManageCustomerAccess()])
    // The gencode-premium onboarding mode is offered only to a live tenant
    // administrator; createCustomer re-verifies it on submit.
    return { categories, canManageAccess, canUseGenCodePremium: canManageAccess }
  },

  /** params: id */
  customer: async (params) => {
    await verifyTenantSession()
    const id = required(params, 'id')
    const [customer, categories, access, canManageAccess] = await Promise.all([
      getCustomer(id), getCustomerCategories(), getCustomerAccess(id), canManageCustomerAccess(),
    ])
    if (!customer) notFound()

    const { guardiansOf, memorialQuota, _count, ...details } = customer
    const { humans, pets } = memorialQuota
    return {
      customer: details,
      categories,
      access,
      canManageAccess,
      canGrant: customer.isActive && !!customer.email,
      stats: {
        acquiredQrCodes: _count.genCodesBought,
        availableProfiles: humans.available + pets.available,
        createdProfiles: humans.count + pets.count,
      },
      memorialQuota,
      memorials: guardiansOf.map(({ appUser }) => appUser),
    }
  },

  /** /customers/business/new prerequisites. */
  businessCustomerNew: async () => {
    await verifyTenantSession()
    return { segments: BUSINESS_SEGMENTS, defaults: businessCustomerDefaults }
  },

  /** params: id */
  businessCustomer: async (params) => {
    await verifyTenantSession()
    const id = required(params, 'id')
    const customer = await loadBusinessCustomer(id)
    const canDeliver = await canManageCustomerAccess()
    const base = appBaseUrl()
    return {
      company: {
        id: customer.id,
        name: customer.name,
        tradeName: customer.tradeName,
        taxId: customer.taxId,
        segment: customer.segment,
        contactName: customer.contactName,
        email: customer.email,
        phoneCountryCode: customer.phoneCountryCode,
        phone: customer.phone,
        notes: customer.notes ?? '',
        isActive: customer.isActive,
        address: customer.address
          ? {
              zip: customer.address.zip ?? '',
              street: customer.address.street ?? '',
              number: customer.address.number ?? '',
              complement: customer.address.complement ?? '',
              neighborhood: customer.address.neighborhood ?? '',
              city: customer.address.city ?? '',
              state: customer.address.state ?? '',
              country: customer.address.country ?? '',
            }
          : null,
      },
      canDeliver,
      appBaseUrl: base,
      codes: customer.sales.flatMap((sale) => sale.genCodes.map((code) => ({
        genCode: code.genCode,
        saleId: sale.id,
        state: getBusinessCodeState(code),
        expiresAt: code.reservation?.expiresAt ?? null,
        url: `${base}/qr/${encodeURIComponent(code.genCode)}`,
        recipient: code.soldToAppUser
          ? { id: code.soldToAppUser.id, name: `${code.soldToAppUser.firstName} ${code.soldToAppUser.lastName}`, email: code.soldToAppUser.email }
          : null,
      }))),
      sales: customer.sales.map((sale) => ({
        id: sale.id,
        quantity: sale.quantity,
        unitValue: sale.unitValue === null ? null : Number(sale.unitValue),
        createdAt: sale.createdAt,
        codes: sale.codes,
        activeCodes: sale.genCodes.filter((code) => getBusinessCodeState(code) === 'available').map((code) => code.genCode),
      })),
    }
  },

  /** A lot's available codes (the web "download codes" .txt). params: customerId, saleId */
  businessLotCodes: async (params) => {
    await verifyTenantSession()
    const { sale, codes } = await loadBusinessSale(params)
    return { saleId: sale.id, filename: `GenCodes-${sale.id}.txt`, codes }
  },

  /** A lot's print sheet (the web "download batch QR" page). params: customerId, saleId */
  businessLotPrintSheet: async (params) => {
    await verifyTenantSession()
    const { sale, codes } = await loadBusinessSale(params)
    const base = appBaseUrl()
    return {
      saleId: sale.id,
      filename: `QR-Codes-${sale.id}.html`,
      appBaseUrl: base,
      codes: codes.map((genCode) => ({ genCode, url: `${base}/qr/${encodeURIComponent(genCode)}` })),
    }
  },

  /* ── /memorialized/[id] ───────────────────────────────────────────────── */

  /** params: id, customerId? (must be an accepted guardian of the memorial). */
  memorial: async (params) => {
    await verifyTenantSession()
    const id = required(params, 'id')
    const deceased = await getDeceased(id)
    if (!deceased) notFound()
    const requestedCustomerId = params.customerId?.trim() || undefined
    if (requestedCustomerId && !deceased.guardianCustomerIds.includes(requestedCustomerId)) notFound()
    const customerId = requestedCustomerId ?? deceased.guardianCustomerIds[0]
    const customer = customerId ? await getCustomer(customerId) : null
    const qrProfile = customer?.guardiansOf.find(({ appUser }) => appUser.id === id)?.appUser

    const { qrCode, guardianCustomerIds, burialLatitude, burialLongitude, ...fields } = deceased
    return {
      memorial: {
        ...fields,
        burialLatitude: burialLatitude !== null ? Number(burialLatitude) : null,
        burialLongitude: burialLongitude !== null ? Number(burialLongitude) : null,
      },
      guardianCustomerIds,
      qrCode,
      // Present only when the QR dialog would render. Opening it is the
      // `getCustomerMemorialQr` ACTION — the first call consumes a GenCode.
      qr: qrProfile
        ? {
            name: `${deceased.firstName} ${deceased.lastName}`.trim(),
            customerId: qrProfile.customerId,
            profileId: id,
            access: qrProfile.qrAccess,
          }
        : null,
    }
  },

  /* ── /categories/customers ────────────────────────────────────────────── */

  customerCategories: async () => {
    await verifyTenantSession()
    return { categories: await getCustomerCategories() }
  },

  /** params: id */
  customerCategory: async (params) => {
    await verifyTenantSession()
    const category = await getCustomerCategory(required(params, 'id'))
    if (!category) notFound()
    return { category }
  },

  /* ── /suppliers (module-gated) ────────────────────────────────────────── */

  suppliers: async () => {
    await verifyTenantSession()
    await requireSupplierModule()
    return { suppliers: await getSuppliers() }
  },

  /** /suppliers/new prerequisites. */
  supplierNew: async () => {
    await verifyTenantSession()
    await requireSupplierModule()
    return { categories: await getSupplierCategories() }
  },

  /** params: id */
  supplier: async (params) => {
    await verifyTenantSession()
    await requireSupplierModule()
    const [supplier, categories] = await Promise.all([
      getSupplier(required(params, 'id')), getSupplierCategories(),
    ])
    if (!supplier) notFound()
    return { supplier, categories }
  },

  /* ── /categories/suppliers (module-gated) ─────────────────────────────── */

  supplierCategories: async () => {
    await verifyTenantSession()
    await requireSupplierCategoryModule()
    return { categories: await getSupplierCategories() }
  },

  /** /categories/suppliers/new: nothing to load, but the module gate applies. */
  supplierCategoryNew: async () => {
    await verifyTenantSession()
    await requireSupplierCategoryModule()
    return { allowed: true }
  },

  /** params: id */
  supplierCategory: async (params) => {
    await verifyTenantSession()
    await requireSupplierCategoryModule()
    const category = await getSupplierCategory(required(params, 'id'))
    if (!category) notFound()
    return { category }
  },

  /* ── /system ──────────────────────────────────────────────────────────── */

  company: async () => {
    await verifyTenantSession()
    const company = await getCompany()
    if (!company) notFound()
    return { company }
  },

  users: async () => {
    await verifyTenantSession()
    const session = await verifySession()
    return { currentUserId: session.user.id, users: await getUsers() }
  },

  /** params: id */
  user: async (params) => {
    await verifyTenantSession()
    const user = await getUser(required(params, 'id'))
    if (!user) notFound()
    return { user }
  },
}

/** No Sequoia screen with data is public; every view requires a bearer token. */
export const publicViews: readonly string[] = []
