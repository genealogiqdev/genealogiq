/**
 * Typed contract for the Sequoia (SEQ) mobile API.
 *
 * Views:   GET  /api/mobile/v1/views/<name>?<params>    → { data }
 * Actions: POST /api/mobile/v1/actions/<name>           → { result, redirect? }
 *
 * Hand-written DTOs — this file never imports server code. Dates arrive as ISO
 * strings; money the server already converts arrives as a number. The tenant
 * is always taken from the bearer token on the server and is never a parameter.
 */
import { view, action } from './client'

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                               */
/* -------------------------------------------------------------------------- */

/** ISO-8601 timestamp, e.g. "2026-11-22T12:00:00.000Z". */
export type IsoDate = string
/** Calendar day "YYYY-MM-DD" (what the form schemas expect for dates). */
export type DateOnly = string

export type SeqRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'COMERCIAL' | 'FINANCE' | 'USER'
export type AssignableRole = Exclude<SeqRole, 'SUPER_ADMIN'>
export type Gender = 'MALE' | 'FEMALE' | 'OTHER'
export type GenCodeStatus = 'AVAILABLE' | 'SOLD' | 'ACTIVATED'
export type BusinessSegment = 'CEMETERY' | 'CREMATORIUM' | 'MEMORIAL' | 'FUNERAL_HOME'
export type BusinessCodeState = 'available' | 'assigned' | 'activated' | 'expired' | 'returned'
export type QrAccess = 'allowed' | 'premiumRequired' | 'limitReached'
export type PartnerCadence = 'cash' | 'installment'

export interface Address {
  zip: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
}
export type AddressInput = Partial<Address>

export interface CategoryOption {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: IsoDate
}
export interface CategoryDetail {
  id: string
  name: string
  description: string | null
  isActive: boolean
}

/* -------------------------------------------------------------------------- */
/* View DTOs                                                                   */
/* -------------------------------------------------------------------------- */

export interface MeView {
  user: { id: string; name: string; email: string; image: string | null; role: SeqRole | string }
  tenant: { id: string; name: string | null; tradeName: string | null; isActive: boolean }
  /** Supplier screens answer 403 when their flag is false. */
  modules: { suppliers: boolean; supplierCategories: boolean }
  /** OWNER / ADMIN / SUPER_ADMIN: may manage staff (system/users mutations). */
  isAdmin: boolean
  /** Live check: may grant/revoke Premium, sell a code to a customer, deliver B2B codes. */
  canManageCustomerAccess: boolean
}

export interface DashboardView {
  stats: {
    availableQRCodes: number
    totalCustomers: number
    monthlyCount: number
    monthlyRevenue: number
    averageTicket: number
    /** Last 12 months, oldest first. */
    monthlyRevenueChart: { month: string; revenue: number }[]
    revenueByChannelChart: { name: 'PLATFORM' | 'MANUAL' | string; revenue: number }[]
    customerGrowthChart: { month: string; count: number }[]
    qrConsumptionChart: { month: string; count: number }[]
  }
  credits: {
    balance: { total: number; general: number; committed: number; nextExpiry: IsoDate | null }
    bySource: { source: string; quantity: number }[]
    contract: {
      status: string
      autoRenew: boolean
      planName: string
      allowance: number
      cycle: { id: string; startAt: IsoDate; endAt: IsoDate; graceEndAt: IsoDate | null; status: string } | null
    } | null
    sellThrough: { granted: number; consumed: number; rate: number | null }
    projectedRollover: { quantity: number; usedFounder: boolean; validity: 'cycle-end' | 'months' } | null
  }
}

export interface ProfileView {
  fullName: string
  email: string
  image: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    avatarUrl: string | null
    role: string
    nationalId: string | null
    birthDate: IsoDate | null
    phoneCountryCode: string
    phone: string | null
    address: Address | null
  } | null
}

export interface StorePlan {
  id: string
  name: string
  code: string
  annualAllowance: number
  currency: string
  annualCashAmount: number
  unitReferenceAmount: number | null
  /** Null when the plan cannot be paid in instalments. */
  installmentCount: number | null
  installmentAmount: number | null
}
export interface PlanOrder {
  id: string
  status: string
  createdAt: IsoDate
  plan: { name: string }
  currentCycle: { startAt: IsoDate; endAt: IsoDate } | null
  /** Only meaningful while status is PENDING: the 24h Stripe link is dead. */
  linkExpired: boolean
}
export interface PurchasingPlansView { currency: string; plans: StorePlan[]; orders: PlanOrder[] }

export interface GenCodePackageOffer { unitPrice: number; currency: string; minimumQuantity: number; available: boolean }
export interface GenCodePackageOrder {
  id: string
  quantity: number
  currency: string
  totalAmount: number
  discountCode: string | null
  discountAmount: number
  status: string
  createdAt: IsoDate
  checkoutExpiresAt: IsoDate | null
  creditExpiresAt: IsoDate | null
}
export interface PurchasingPackagesView { offer: GenCodePackageOffer | null; orders: GenCodePackageOrder[] }

export interface LicenseRow {
  id: string
  genCode: string
  status: GenCodeStatus
  printedAt: IsoDate | null
  soldAt: IsoDate | null
  soldVia: 'MANUAL' | 'PLATFORM' | string | null
  soldToName: string | null
  activatedAt: IsoDate | null
  createdAt: IsoDate
  appUser: { firstName: string; lastName: string } | null
  soldToAppUser: { firstName: string; lastName: string } | null
  mintedInCycle: { id: string; endAt: IsoDate } | null
}
export interface ActivationsView {
  status: GenCodeStatus | null
  summary: { total: number; available: number; sold: number; activated: number }
  licenses: LicenseRow[]
}
export interface ActivationView {
  genCode: string
  formattedGenCode: string
  /** What the QR encodes; built from the server's APP_URL. */
  qrUrl: string
  filename: string
  status: GenCodeStatus
  printedAt: IsoDate | null
  soldAt: IsoDate | null
  soldVia: string | null
  soldToName: string | null
  soldValue: number | null
  activatedAt: IsoDate | null
  createdAt: IsoDate
  memorial: { firstName: string; lastName: string } | null
  buyer: { firstName: string; lastName: string; email: string } | null
  soldByName: string | null
}

export interface QrTarget { genCode: string; url: string }
export interface StockPrintBatchView {
  /** False when the quantity is invalid or stock is short; `message` says why. */
  ok: boolean
  message: string
  appBaseUrl: string | null
  codes: QrTarget[]
}

export interface CustomerAccess {
  planName: string
  planCode: 'FREE' | 'PREMIUM' | string
  expiresAt: IsoDate | null
  /** The partner gift that can be revoked, when one is live. */
  grantId: string | null
}
export interface CustomerRow {
  id: string
  firstName: string
  lastName: string
  email: string | null
  isActive: boolean
  createdAt: IsoDate
  access: CustomerAccess
  genCodesSold: number
}
export interface CustomersView { customers: CustomerRow[]; canManageAccess: boolean }

export interface BusinessCustomerRow {
  id: string
  name: string
  tradeName: string
  taxId: string
  segment: BusinessSegment
  contactName: string
  email: string
  phone: string
  isActive: boolean
  createdAt: IsoDate
  genCodesSold: number
  available: number
  assigned: number
  activated: number
}
export interface BusinessCustomersView { companies: BusinessCustomerRow[] }

export interface CustomerNewView {
  categories: CategoryOption[]
  canManageAccess: boolean
  /** Whether the "GenCode sale + 12 months Premium" onboarding mode may be offered. */
  canUseGenCodePremium: boolean
}

export interface MemorialQuota {
  planName: string
  planCode: string
  humans: { count: number; limit: number; available: number }
  pets: { count: number; limit: number; available: number }
}
export interface CustomerMemorial {
  id: string
  firstName: string
  lastName: string
  birthDate: IsoDate | null
  deathDate: IsoDate | null
  role: 'APP_MEMO' | 'APP_PET'
  /** The guardian customer to pass to getCustomerMemorialQr. */
  customerId: string
  profileUrl: string
  qrAccess: QrAccess
}
export interface CustomerDetail {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  birthDate: IsoDate | null
  birthCity: string | null
  birthState: string | null
  birthCountry: string | null
  email: string | null
  phoneCountryCode: string
  phone: string | null
  categoryId: string | null
  notes: string | null
  isActive: boolean
  fb: string | null
  instagram: string | null
  linkedin: string | null
  tiktok: string | null
  x: string | null
  youtube: string | null
  otherSocial: string | null
  website: string | null
  address: Address | null
}
export interface CustomerView {
  customer: CustomerDetail
  categories: CategoryOption[]
  access: CustomerAccess | null
  /** Show grant/revoke/sell controls only when true (the server re-checks). */
  canManageAccess: boolean
  /** Premium can be granted only to an active customer with an email. */
  canGrant: boolean
  stats: { acquiredQrCodes: number; availableProfiles: number; createdProfiles: number }
  memorialQuota: MemorialQuota
  memorials: CustomerMemorial[]
}

export interface BusinessCustomerNewView { segments: BusinessSegment[]; defaults: BusinessCustomerInput }
export interface BusinessCodeRow {
  genCode: string
  saleId: string
  state: BusinessCodeState
  expiresAt: IsoDate | null
  url: string
  recipient: { id: string; name: string; email: string | null } | null
}
export interface BusinessSaleRow {
  id: string
  quantity: number
  unitValue: number | null
  createdAt: IsoDate
  codes: string[]
  /** Codes of this lot still available to deliver/print. */
  activeCodes: string[]
}
export interface BusinessCustomerView {
  company: {
    id: string
    name: string
    tradeName: string
    taxId: string
    segment: BusinessSegment
    contactName: string
    email: string
    phoneCountryCode: string
    phone: string
    notes: string
    isActive: boolean
    address: { [K in keyof Address]: string } | null
  }
  /** Deliver-to-recipient is offered only when true (the server re-checks). */
  canDeliver: boolean
  appBaseUrl: string
  codes: BusinessCodeRow[]
  sales: BusinessSaleRow[]
}
export interface BusinessLotCodesView { saleId: string; filename: string; codes: string[] }
export interface BusinessLotPrintSheetView { saleId: string; filename: string; appBaseUrl: string; codes: QrTarget[] }

export interface MemorialView {
  memorial: {
    id: string
    firstName: string
    lastName: string
    gender: Gender | null
    birthDate: IsoDate | null
    birthCity: string | null
    birthState: string | null
    birthCountry: string | null
    deathDate: IsoDate | null
    deathCause: string | null
    deathCity: string
    deathState: string | null
    deathCountry: string | null
    burialDate: DateOnly | ''
    burialLatitude: number | null
    burialLongitude: number | null
    burialSite: string
    burialZip: string
    burialStreet: string
    burialNumber: string
    burialComplement: string
    burialNeighborhood: string
    burialCity: string
    burialState: string
    burialCountry: string
    fb: string | null
    instagram: string | null
    linkedin: string | null
    tiktok: string | null
    x: string | null
    youtube: string | null
    otherSocial: string | null
    website: string | null
    notes: string | null
  }
  guardianCustomerIds: string[]
  qrCode: {
    id: string
    url: string
    status: string
    printedAt: IsoDate | null
    installedAt: IsoDate | null
    scanCount: number
    lastScannedAt: IsoDate | null
  } | null
  /** Null when no tenant customer is an accepted guardian (no QR dialog). */
  qr: { name: string; customerId: string; profileId: string; access: QrAccess } | null
}

export interface SupplierRow {
  id: string
  entityType: 'INDIVIDUAL' | 'COMPANY'
  name: string
  email: string
  isActive: boolean
  createdAt: IsoDate
  category: { id: string; name: string } | null
}
export interface SupplierDetail {
  id: string
  entityType: 'INDIVIDUAL' | 'COMPANY'
  name: string
  tradeName: string
  taxId: string
  stateRegistration: string | null
  municipalRegistration: string | null
  birthDate: IsoDate | null
  email: string
  phoneCountryCode: string
  phone: string
  notes: string | null
  categoryId: string | null
  isActive: boolean
  address: Address | null
}

export interface CompanyView {
  company: {
    id: string
    legalName: string
    tradeName: string
    taxId: string
    stateRegistration: string | null
    municipalRegistration: string | null
    email: string
    phoneCountryCode: string
    phone: string
    isActive: boolean
    address: Address | null
  }
}

export interface StaffRow {
  id: string
  firstName: string
  lastName: string
  email: string
  role: SeqRole | string
  isActive: boolean
  createdAt: IsoDate
}
export interface StaffDetail {
  id: string
  firstName: string
  lastName: string
  email: string
  role: SeqRole | string
  nationalId: string | null
  birthDate: IsoDate | null
  phoneCountryCode: string
  phone: string | null
  isActive: boolean
  address: Address | null
}

/* -------------------------------------------------------------------------- */
/* Action inputs (mirror the server Zod schemas)                               */
/* -------------------------------------------------------------------------- */

export interface ProfileInput {
  firstName: string
  lastName: string
  nationalId?: string | null
  birthDate?: DateOnly | null
  phoneCountryCode: string
  phone?: string | null
  address?: AddressInput
}
export interface CompanyInput {
  legalName: string
  tradeName: string
  taxId: string
  stateRegistration?: string | null
  municipalRegistration?: string | null
  email: string
  phoneCountryCode: string
  phone: string
  isActive: boolean
  address?: AddressInput
}
export interface StaffInput {
  firstName: string
  lastName: string
  email: string
  role: AssignableRole
  nationalId?: string | null
  birthDate?: DateOnly | null
  phoneCountryCode: string
  phone?: string | null
  isActive: boolean
  address?: AddressInput
}
export interface CustomerInput {
  firstName: string
  lastName: string
  gender?: Gender | null
  birthDate: DateOnly
  birthCity?: string | null
  birthState?: string | null
  birthCountry: string
  email: string
  phoneCountryCode: string
  phone: string
  categoryId?: string | null
  notes?: string | null
  isActive: boolean
  fb?: string | null
  instagram?: string | null
  linkedin?: string | null
  tiktok?: string | null
  x?: string | null
  youtube?: string | null
  otherSocial?: string | null
  website?: string | null
  address?: AddressInput
}
export type CustomerOnboarding =
  | { mode: 'registration' }
  /** Admin-only. `requestId` is a UUID reused on retry so a sale is recorded once. */
  | { mode: 'gencode-premium'; requestId: string; genCode?: string }
export interface DeceasedInput {
  firstName: string
  lastName: string
  gender?: Gender | null
  birthDate: DateOnly
  birthCity?: string | null
  birthState: string
  birthCountry: string
  deathDate: DateOnly
  deathCause?: string | null
  deathCity?: string | null
  deathState?: string | null
  deathCountry: string
  burialDate?: DateOnly | null
  burialLatitude?: number | null
  burialLongitude?: number | null
  burialSite?: string | null
  burialZip?: string | null
  burialStreet?: string | null
  burialNumber?: string | null
  burialComplement?: string | null
  burialNeighborhood?: string | null
  burialCity?: string | null
  burialState?: string | null
  burialCountry?: string | null
  fb?: string | null
  instagram?: string | null
  linkedin?: string | null
  tiktok?: string | null
  x?: string | null
  youtube?: string | null
  otherSocial?: string | null
  website?: string | null
  notes?: string | null
}
export interface BusinessCustomerInput {
  name: string
  tradeName: string
  /** CNPJ; punctuation is stripped on the server. */
  taxId: string
  segment: BusinessSegment
  contactName: string
  email: string
  phoneCountryCode: string
  phone: string
  notes: string
  isActive: boolean
  address?: AddressInput
}
export interface BusinessSaleInput {
  /** UUID reused on retry so the lot is recorded once. */
  requestId: string
  quantity: number
  /** Optional specific codes separated by spaces, commas or new lines; '' lets the server pick. */
  genCode: string
  unitValue?: number
}
export interface BusinessRecipientInput { genCode: string; firstName: string; lastName: string; email: string }
/** name 8–24 chars, description 12–48 chars. */
export interface CategoryInput { name: string; description: string; isActive: boolean }
export interface SupplierInput {
  entityType: 'INDIVIDUAL' | 'COMPANY'
  name: string
  tradeName: string
  taxId: string
  stateRegistration?: string | null
  municipalRegistration?: string | null
  birthDate?: DateOnly | null
  email: string
  phoneCountryCode: string
  phone: string
  notes?: string | null
  categoryId: string
  isActive: boolean
  address?: AddressInput
}
export interface FeedbackInput { type: 'bug' | 'feedback'; message: string; page?: string }

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

export const seqApi = {
  /* ── Views ──────────────────────────────────────────────────────────────── */
  me: () => view<MeView>('seq', 'me'),
  dashboard: () => view<DashboardView>('seq', 'dashboard'),
  profile: () => view<ProfileView>('seq', 'profile'),
  purchasingPlans: () => view<PurchasingPlansView>('seq', 'purchasingPlans'),
  purchasingPackages: () => view<PurchasingPackagesView>('seq', 'purchasingPackages'),
  activations: (status?: GenCodeStatus) => view<ActivationsView>('seq', 'activations', { status }),
  activation: (genCode: string) => view<ActivationView>('seq', 'activation', { genCode }),
  /** Read-only. Confirm the physical print afterwards with markGenCodeBatchPrinted. */
  stockPrintBatch: (quantity: number) => view<StockPrintBatchView>('seq', 'stockPrintBatch', { quantity }),
  customers: () => view<CustomersView>('seq', 'customers'),
  businessCustomers: () => view<BusinessCustomersView>('seq', 'businessCustomers'),
  customerNew: () => view<CustomerNewView>('seq', 'customerNew'),
  customer: (id: string) => view<CustomerView>('seq', 'customer', { id }),
  businessCustomerNew: () => view<BusinessCustomerNewView>('seq', 'businessCustomerNew'),
  businessCustomer: (id: string) => view<BusinessCustomerView>('seq', 'businessCustomer', { id }),
  businessLotCodes: (customerId: string, saleId: string) =>
    view<BusinessLotCodesView>('seq', 'businessLotCodes', { customerId, saleId }),
  businessLotPrintSheet: (customerId: string, saleId: string) =>
    view<BusinessLotPrintSheetView>('seq', 'businessLotPrintSheet', { customerId, saleId }),
  /** `customerId` selects which guardian's plan decides QR access (defaults to the first). */
  memorial: (id: string, customerId?: string) => view<MemorialView>('seq', 'memorial', { id, customerId }),
  customerCategories: () => view<{ categories: CategoryOption[] }>('seq', 'customerCategories'),
  customerCategory: (id: string) => view<{ category: CategoryDetail }>('seq', 'customerCategory', { id }),
  suppliers: () => view<{ suppliers: SupplierRow[] }>('seq', 'suppliers'),
  supplierNew: () => view<{ categories: CategoryOption[] }>('seq', 'supplierNew'),
  supplier: (id: string) => view<{ supplier: SupplierDetail; categories: CategoryOption[] }>('seq', 'supplier', { id }),
  supplierCategories: () => view<{ categories: CategoryOption[] }>('seq', 'supplierCategories'),
  supplierCategoryNew: () => view<{ allowed: true }>('seq', 'supplierCategoryNew'),
  supplierCategory: (id: string) => view<{ category: CategoryDetail }>('seq', 'supplierCategory', { id }),
  company: () => view<CompanyView>('seq', 'company'),
  users: () => view<{ currentUserId: string; users: StaffRow[] }>('seq', 'users'),
  user: (id: string) => view<{ user: StaffDetail }>('seq', 'user', { id }),

  /* ── Account (public) ───────────────────────────────────────────────────── */
  /** Always answers ok with redirect "/forgot-password?sent=true" (no enumeration). */
  forgotPassword: (email: string) => action('seq', 'forgotPassword', { form: { email } }),
  /** Success answers ok with redirect "/sign-in?reset=true". */
  resetPassword: (token: string, password: string) => action('seq', 'resetPassword', { form: { token, password } }),
  verifyEmail: (token: string) =>
    action<{ status: 'verified' | 'changed' }>('seq', 'verifyEmail', { form: { token } }),

  /* ── Account (signed in) ────────────────────────────────────────────────── */
  changePassword: (currentPassword: string, newPassword: string) =>
    action('seq', 'changePassword', { form: { currentPassword, newPassword } }),
  requestEmailChange: (newEmail: string, currentPassword: string) =>
    action('seq', 'requestEmailChange', { form: { newEmail, currentPassword } }),
  /** Success answers ok with redirect "/"; discard the token afterwards. */
  deleteAccount: (currentPassword: string) => action('seq', 'deleteAccount', { form: { currentPassword } }),
  updateProfile: (data: ProfileInput) => action('seq', 'updateProfile', { args: [data] }),
  /** `url` must be the one returned by an upload through seqHttp.profileUpload(). */
  updateAvatar: (url: string) => action('seq', 'updateAvatar', { args: [url] }),

  /* ── System (users: admin only) ─────────────────────────────────────────── */
  updateCompany: (id: string, data: CompanyInput) => action('seq', 'updateCompany', { args: [id, data] }),
  createUser: (data: StaffInput) => action('seq', 'createUser', { args: [data] }),
  updateUser: (id: string, data: StaffInput) => action('seq', 'updateUser', { args: [id, data] }),
  deleteUser: (userId: string) => action('seq', 'deleteUser', { args: [userId] }),
  toggleUserActive: (userId: string) => action('seq', 'toggleUserActive', { args: [userId] }),
  resendWelcomeEmail: (userId: string) => action('seq', 'resendWelcomeEmail', { args: [userId] }),

  /* ── Customers (consumers) ──────────────────────────────────────────────── */
  createCustomer: (data: CustomerInput, onboarding: CustomerOnboarding = { mode: 'registration' }) =>
    action('seq', 'createCustomer', { args: [data, onboarding] }),
  createCustomerWithDeceased: (
    data: CustomerInput,
    deceased: DeceasedInput,
    onboarding: CustomerOnboarding = { mode: 'registration' },
  ) => action('seq', 'createCustomerWithDeceased', { args: [data, deceased, onboarding] }),
  updateCustomer: (id: string, data: CustomerInput) => action('seq', 'updateCustomer', { args: [id, data] }),
  deleteCustomer: (id: string) => action('seq', 'deleteCustomer', { args: [id] }),
  resendCustomerEmail: (id: string) => action('seq', 'resendCustomerEmail', { args: [id] }),
  toggleCustomerActive: (id: string) => action('seq', 'toggleCustomerActive', { args: [id] }),
  /** Admin only. `requestId` is a UUID reused on retry. */
  grantCustomerPremium: (appUserId: string, requestId: string) =>
    action('seq', 'grantCustomerPremium', { args: [appUserId, requestId] }),
  /** Admin only. `grantId` comes from CustomerAccess.grantId. */
  revokeCustomerPremium: (appUserId: string, grantId: string) =>
    action('seq', 'revokeCustomerPremium', { args: [appUserId, grantId] }),
  /** Admin only. Sells one identified physical code to an existing customer. */
  sellCustomerGenCode: (appUserId: string, genCode: string, requestId: string) =>
    action('seq', 'sellCustomerGenCode', { args: [appUserId, genCode, requestId] }),

  /* ── Customers (B2B companies) ──────────────────────────────────────────── */
  /** Pass `null` as id to create. */
  saveBusinessCustomer: (id: string | null, data: BusinessCustomerInput) =>
    action('seq', 'saveBusinessCustomer', { args: [id, data] }),
  sellBusinessGenCodes: (customerId: string, input: BusinessSaleInput) =>
    action('seq', 'sellBusinessGenCodes', { args: [customerId, input] }),
  /** Admin only. */
  deliverBusinessGenCode: (customerId: string, input: BusinessRecipientInput) =>
    action('seq', 'deliverBusinessGenCode', { args: [customerId, input] }),
  resendBusinessGenCode: (customerId: string, genCode: string) =>
    action('seq', 'resendBusinessGenCode', { args: [customerId, genCode] }),

  /* ── Memorials ──────────────────────────────────────────────────────────── */
  updateDeceased: (id: string, data: DeceasedInput) => action('seq', 'updateDeceased', { args: [id, data] }),
  deleteDeceased: (id: string) => action('seq', 'deleteDeceased', { args: [id] }),
  addGuardian: (memorialId: string, guardianId: string) =>
    action('seq', 'addGuardian', { args: [memorialId, guardianId] }),
  removeGuardian: (memorialId: string, guardianId: string) =>
    action('seq', 'removeGuardian', { args: [memorialId, guardianId] }),
  markQrPrinted: (appUserId: string) => action('seq', 'markQrPrinted', { args: [appUserId] }),
  markQrInstalled: (appUserId: string) => action('seq', 'markQrInstalled', { args: [appUserId] }),
  /**
   * NOT a plain read: the first call for a memorial consumes one GenCode and
   * its credit. Call it only when the user opens/exports the QR — never
   * prefetch, poll or auto-retry it.
   */
  getCustomerMemorialQr: (customerId: string, profileId: string) =>
    action<{ profileUrl: string }>('seq', 'getCustomerMemorialQr', { args: [customerId, profileId] }),

  /* ── Categories ─────────────────────────────────────────────────────────── */
  createCustomerCategory: (data: CategoryInput) =>
    action<{ category: { id: string; name: string } }>('seq', 'createCustomerCategory', { args: [data] }),
  updateCustomerCategory: (id: string, data: CategoryInput) =>
    action('seq', 'updateCustomerCategory', { args: [id, data] }),
  deleteCustomerCategory: (id: string) => action('seq', 'deleteCustomerCategory', { args: [id] }),
  toggleCustomerCategoryActive: (id: string) => action('seq', 'toggleCustomerCategoryActive', { args: [id] }),
  createSupplierCategory: (data: CategoryInput) => action('seq', 'createSupplierCategory', { args: [data] }),
  updateSupplierCategory: (id: string, data: CategoryInput) =>
    action('seq', 'updateSupplierCategory', { args: [id, data] }),
  deleteSupplierCategory: (id: string) => action('seq', 'deleteSupplierCategory', { args: [id] }),
  toggleSupplierCategoryActive: (id: string) => action('seq', 'toggleSupplierCategoryActive', { args: [id] }),

  /* ── Suppliers ──────────────────────────────────────────────────────────── */
  createSupplier: (data: SupplierInput) => action('seq', 'createSupplier', { args: [data] }),
  updateSupplier: (id: string, data: SupplierInput) => action('seq', 'updateSupplier', { args: [id, data] }),
  deleteSupplier: (id: string) => action('seq', 'deleteSupplier', { args: [id] }),
  toggleSupplierActive: (id: string) => action('seq', 'toggleSupplierActive', { args: [id] }),

  /* ── GenCode inventory ──────────────────────────────────────────────────── */
  prepareGenCodePrintBatch: (quantity: number) =>
    action<{ codes: string[]; appBaseUrl: string }>('seq', 'prepareGenCodePrintBatch', { args: [quantity] }),
  markGenCodeBatchPrinted: (codes: string[]) => action('seq', 'markGenCodeBatchPrinted', { args: [codes] }),
  markGenCodePrinted: (genCode: string, printed: boolean) =>
    action('seq', 'markGenCodePrinted', { args: [genCode, printed] }),
  sellGenCodeManually: (genCode: string, input: { buyerName: string; value?: number }) =>
    action('seq', 'sellGenCodeManually', { args: [genCode, input] }),
  sellGenCodeViaPlatform: (
    genCode: string,
    input: { firstName: string; lastName: string; email: string; value?: number },
  ) => action('seq', 'sellGenCodeViaPlatform', { args: [genCode, input] }),
  undoGenCodeSale: (genCode: string) => action('seq', 'undoGenCodeSale', { args: [genCode] }),

  /* ── Purchasing (open result.data.url in the system browser) ────────────── */
  subscribeToPartnerPlan: (planId: string, cadence: PartnerCadence) =>
    action<{ url: string }>('seq', 'subscribeToPartnerPlan', { args: [planId, cadence] }),
  purchaseGenCodePackage: (quantity: number) =>
    action<{ url: string }>('seq', 'purchaseGenCodePackage', { args: [{ quantity }] }),

  /* ── Support ────────────────────────────────────────────────────────────── */
  sendFeedback: (data: FeedbackInput) => action('seq', 'sendFeedback', { args: [data] }),
}

/** Entity kinds /api/entity-name resolves (tenant-scoped on the server). */
export type SeqEntityType =
  | 'users' | 'customers' | 'business-customers' | 'suppliers'
  | 'memorialized' | 'supplier-categories' | 'customer-categories'

/** Plain HTTP routes the app calls directly with the same bearer token. */
export const seqHttp = {
  /** POST: media upload handshake for the signed-in user's avatar (images ≤ 5 MB). */
  profileUpload: () => '/api/profile/upload',
  /** GET → { name } for a breadcrumb/title; 404 outside the caller's tenant. */
  entityName: (type: SeqEntityType, id: string) =>
    `/api/entity-name?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
}
