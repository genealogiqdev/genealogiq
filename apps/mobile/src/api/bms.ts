/**
 * BMS (back-office) mobile API contract.
 *
 * Hand-written DTOs for `apps/bms/src/mobile/{views,actions}.ts`. Never import
 * server code here. Dates arrive as ISO strings and Prisma Decimals as strings;
 * values the server already converts with Number() arrive as numbers.
 *
 * Views that price things (`contractNew`, `discountCouponNew`,
 * `discountCouponRedeem`) and the actions that sell them derive the currency
 * from the request language, exactly like the web: send `Accept-Language`.
 */
import { view, action } from './client'

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

export type IsoDate = string
/** A Prisma Decimal serialised as a string, e.g. "10.00". */
export type DecimalString = string

export type BmsRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'COMERCIAL' | 'FINANCE' | 'USER'
export type AssignableRole = Exclude<BmsRole, 'SUPER_ADMIN'>
export type EntityType = 'INDIVIDUAL' | 'COMPANY'
export type PartnerSegment = 'FUNERAL_HOME' | 'MARBLE_SHOP' | 'CEMETERY' | 'URN_MANUFACTURER' | 'PLAQUE_PRINTER'
export type AppCurrency = 'usd' | 'brl' | 'mxn'
export type PartnerCadence = 'cash' | 'installment'

/** Shown in place of PII for roles outside SUPER_ADMIN / OWNER / ADMIN. */
export const REDACTED = '•••'

export interface Address {
  zip?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export interface TenantRef { id: string; name: string }
export interface PartnerOption { id: string; name: string; tradeName: string | null }

/* -------------------------------------------------------------------------- */
/* Session, dashboard, profile                                                */
/* -------------------------------------------------------------------------- */

export interface MeView {
  user: { id: string; name: string; email: string; image: string | null }
  role: BmsRole
  /** SUPER_ADMIN / OWNER / ADMIN: may run administrative actions and read unredacted PII. */
  isAdmin: boolean
  /** Live platform scope for the APP customer directory and partner GenCode overview. */
  isConsumerAdmin: boolean
}

export interface DashboardView {
  subscriptions: number
  packages: number
  customers: number
  systemUsers: number
  monthlyCount: number
  monthlyRevenue: number
  yearlyCount: number
  yearlyRevenue: number
  totalCount: number
  totalRevenue: number
  monthlyRevenueChart: { month: string; revenue: number }[]
  revenueByPackageChart: { name: string; revenue: number }[]
  customerGrowthChart: { month: string; count: number }[]
  topSellersChart: { name: string; count: number; revenue: number }[]
}

export interface ProfileFormValues {
  firstName: string
  lastName: string
  nationalId?: string | null
  /** YYYY-MM-DD or empty. */
  birthDate?: string | null
  phoneCountryCode: string
  phone?: string | null
  address?: Address | null
}

export interface ProfileView {
  fullName: string
  email: string
  image: string | null
  values: ProfileFormValues | null
}

export interface FeedbackInput { type: 'bug' | 'feedback'; message: string; page?: string }

/* -------------------------------------------------------------------------- */
/* Partners (customers)                                                       */
/* -------------------------------------------------------------------------- */

export interface CustomerRow {
  id: string
  entityType: EntityType
  businessSegment: PartnerSegment
  name: string
  email: string
  isActive: boolean
  createdAt: IsoDate
}

export interface CustomersView { customers: CustomerRow[]; role: BmsRole; isAdmin: boolean }

export interface CustomerFormValues {
  entityType: EntityType
  businessSegment: PartnerSegment
  name: string
  tradeName: string
  taxId: string
  stateRegistration?: string | null
  municipalRegistration?: string | null
  /** YYYY-MM-DD or empty. */
  birthDate?: string | null
  email: string
  phoneCountryCode: string
  phone: string
  notes?: string | null
  isActive: boolean
  moduleRecordsSuppliers?: boolean
  moduleCategoriesSuppliers?: boolean
  address?: Address
}

export interface CustomerCreateFormValues extends CustomerFormValues {
  owner: { firstName: string; lastName: string; email: string }
  /** 0–10,000 GenCodes granted without a purchase. */
  initialGenCodes?: number
}

export interface CustomerNewView {
  entityTypes: EntityType[]
  segments: PartnerSegment[]
  defaults: CustomerCreateFormValues
  canSubmit: boolean
}

export interface CustomerDetail {
  id: string
  entityType: EntityType
  businessSegment: PartnerSegment
  name: string
  tradeName: string
  /** REDACTED for non-admin roles. */
  taxId: string
  stateRegistration: string | null
  municipalRegistration: string | null
  birthDate: IsoDate | null
  email: string
  phoneCountryCode: string
  /** REDACTED for non-admin roles. */
  phone: string
  notes: string | null
  isActive: boolean
  moduleRecordsSuppliers: boolean
  moduleCategoriesSuppliers: boolean
  /** Always null for non-admin roles. */
  address: Address | null
}

export interface CustomerView {
  customer: CustomerDetail
  /** Sequoia access card; null for non-admin roles. */
  access: { owner: { email: string; isActive: boolean } | null } | null
  canEdit: boolean
}

/* -------------------------------------------------------------------------- */
/* APP customer directory                                                     */
/* -------------------------------------------------------------------------- */

export interface ConsumerRow {
  id: string
  firstName: string
  lastName: string
  email: string | null
  isActive: boolean
  createdAt: IsoDate
  tenantId: string | null
  tenant: PartnerOption | null
  genCodesSold: number
  /** Live paid/complimentary plan; null means FREE. */
  access: { planName: string; until: IsoDate } | null
  /** Latest direct (tenantless) Premium gift, live or revoked. */
  gift: { id: string; expiresAt: IsoDate; emailSentAt: IsoDate | null; revokedAt: IsoDate | null } | null
  capabilities: {
    /** `linkConsumerPartner` is offered. */
    linkPartner: boolean
    /** `resendConsumerAccessEmail` is offered. */
    resendAccess: boolean
    /** Grant ID for `revokeConsumerAccess`, when a live direct gift exists. */
    revokeDirectGrantId: string | null
    /** Partner customers: `grantPartnerPremium` / `revokePartnerPremium`. */
    partnerPremium: { canGrant: boolean; revokeGrantId: string | null } | null
    /** Open the registration form prefilled (`consumerNew` with this id). */
    grantDirect: boolean
  }
}

export interface ConsumersParams {
  q?: string
  page?: number
  status?: 'all' | 'active' | 'inactive'
  tenant?: string
}

export interface ConsumersView {
  total: number
  page: number
  pages: number
  pageSize: 25
  status: 'all' | 'active' | 'inactive'
  tenantId: string
  partners: PartnerOption[]
  consumers: ConsumerRow[]
}

export interface ConsumerNewView {
  initial: { firstName: string; lastName: string; email: string | null } | null
  partners: PartnerOption[]
}

export interface ConsumerFormValues {
  /** Client-generated UUID; makes a retried submit idempotent. */
  requestId: string
  firstName: string
  lastName: string
  email: string
  notes?: string
}

export interface ConsumerRegistrationResult {
  appUserId: string
  expiresAt: IsoDate
  alreadyGranted: boolean
  emailPending: boolean
}

/* -------------------------------------------------------------------------- */
/* Consumer pricing                                                           */
/* -------------------------------------------------------------------------- */

export interface SubscriptionRow {
  id: string
  code: string
  name: string
  description: string | null
  termLength: number
  isActive: boolean
  createdAt: IsoDate
  priceUsd: number
}

export interface SubscriptionsView { subscriptions: SubscriptionRow[]; role: BmsRole; isAdmin: boolean }

export interface SubscriptionFormValues {
  code: string
  name: string
  description?: string
  isActive: boolean
  termLength: number
  priceUsd: number
  monthlyPriceUsd: number
  priceBrl: number
  monthlyPriceBrl: number
  priceMxn: number
  monthlyPriceMxn: number
  treeMaxMembers: number
  bioMaxChars: number
  mediaMaxImages: number
  mediaMaxVideos: number
  documentsMax: number
  geoPlacesMax: number
  memorialsMax: number
  petsMax: number
  qrCodeMax: number
}

export interface SubscriptionNewView { defaults: SubscriptionFormValues; canSubmit: boolean }

export interface SubscriptionDetail {
  id: string
  code: string
  name: string
  description: string | null
  termLength: number
  treeMaxMembers: number
  bioMaxChars: number
  mediaMaxImages: number
  mediaMaxVideos: number
  documentsMax: number
  geoPlacesMax: number
  memorialsMax: number
  petsMax: number
  qrCodeMax: number
  isActive: boolean
  createdAt: IsoDate
  prices: {
    id: string
    currency: string
    countryScope: string | null
    annualCashAmount: DecimalString
    installmentCount: number | null
    installmentAmount: DecimalString | null
    version: number
    stripeProductId: string | null
    stripeCashPriceId: string | null
    stripeInstallmentPriceId: string | null
  }[]
  priceUsd: number
  monthlyPriceUsd: number | null
  priceBrl: number | null
  monthlyPriceBrl: number | null
  priceMxn: number | null
  monthlyPriceMxn: number | null
  stripeProductId: string | null
  stripeAnnualPriceIdUsd: string | null
  stripeMonthlyPriceIdUsd: string | null
  stripeAnnualPriceIdBrl: string | null
  stripeMonthlyPriceIdBrl: string | null
  stripeAnnualPriceIdMxn: string | null
  stripeMonthlyPriceIdMxn: string | null
}

export interface SubscriptionView { subscription: SubscriptionDetail; canEdit: boolean }

export interface ExtraUnitPriceRow {
  id: string
  resource: string
  tier: string
  priceUsd: number | null
  priceBrl: number | null
  priceMxn: number | null
  stripeProductId: string | null
  stripePriceIdUsd: string | null
  stripePriceIdBrl: string | null
  stripePriceIdMxn: string | null
}

export interface ExtraUnitPricesView { prices: ExtraUnitPriceRow[]; canEdit: boolean }
export interface ExtraUnitPriceFormValues { priceUsd: number; priceBrl: number; priceMxn: number }

/* -------------------------------------------------------------------------- */
/* Discount coupons                                                           */
/* -------------------------------------------------------------------------- */

export interface SelectableCoupon {
  id: string
  code: string
  redemptionMode: string
  discountType: string
  /** Percent, or the fixed amount already resolved for the view's currency. */
  value: number
  /** Empty means every product. */
  productIds: string[]
}

export interface DiscountCouponRow {
  id: string
  code: string
  description: string | null
  discountType: string
  redemptionMode: string
  percentOff: DecimalString | null
  amountOffUsd: DecimalString | null
  amountOffBrl: DecimalString | null
  amountOffMxn: DecimalString | null
  duration: string
  durationInMonths: number | null
  maxRedemptions: number | null
  redeemBy: IsoDate | null
  isActive: boolean
  createdAt: IsoDate
}

export interface DiscountCouponsView { coupons: DiscountCouponRow[]; role: BmsRole; isAdmin: boolean }

export interface DiscountCouponDetail extends DiscountCouponRow {
  stripeCouponId: string | null
  stripePromotionCodeId: string | null
  appliesTo: TenantRef[]
}

export interface DiscountCouponView { coupon: DiscountCouponDetail; canEdit: boolean }

export interface CouponProductOption {
  kind: 'partner-plan' | 'gencode-package' | 'consumer'
  id: string
  name: string
  quantity: number
  price: number
  currency: string
  stripeSynced: boolean
}

export interface DiscountCouponNewView { currency: AppCurrency; products: CouponProductOption[]; canSubmit: boolean }

export interface DiscountCouponFormValues {
  code: string
  description?: string | null
  discountType: 'percent' | 'amount'
  redemptionMode?: 'stripe' | 'manual'
  percentOff: number
  amountOffUsd: number
  amountOffBrl: number
  amountOffMxn: number
  duration: 'once' | 'forever' | 'repeating'
  durationInMonths?: number | null
  maxRedemptions?: number | null
  /** ISO date-time; the server turns it into a Date. */
  redeemBy?: IsoDate | null
  /** Local product IDs from `discountCouponNew`. */
  appliesTo: string[]
}

export interface ManualCouponProduct {
  id: string
  name: string
  kind: 'partner' | 'consumer' | 'package'
  currency: string
  amount: number
  monthlyAmount: number | null
  quantity: number
  minimumQuantity: number
  termMonths: number
}

export interface ManualCouponHistoryRow {
  id: string
  code: string
  kind: string
  source: string
  reference: string
  quantity: number
  emailSentAt: IsoDate | null
  currency: string
  externalAmount: number | null
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
  createdAt: IsoDate
  operator: string
  recipient: string
  product: string
  endsAt: IsoDate | null
}

export interface DiscountCouponRedeemView {
  /** Uppercase ISO code. */
  currency: string
  options: {
    coupons: { id: string; code: string; productIds: string[] }[]
    tenants: { id: string; name: string; taxId: string }[]
    products: ManualCouponProduct[]
  }
  history: ManualCouponHistoryRow[]
}

export interface ManualCouponFormValues {
  /** Client-generated UUID; makes a retried submit idempotent. */
  requestId: string
  couponId: string
  kind: 'partner' | 'package' | 'consumer'
  productId: string
  tenantId?: string
  consumerEmail?: string
  quantity: number
  cadence: 'annual' | 'monthly'
  source: 'external_payment' | 'legacy_stock'
  reference: string
  externalAmount?: number | null
  confirmed: boolean
}

export interface ManualCouponResult {
  id: string
  kind: string
  resultId: string
  alreadyApplied: boolean
  accessPending?: boolean
  emailPending?: boolean
}

/* -------------------------------------------------------------------------- */
/* GenCode packages                                                           */
/* -------------------------------------------------------------------------- */

export interface GenCodePackageRow {
  id: string
  code: string
  name: string
  unitPrice: number
  currency: string
  minimumQuantity: number
  activationTrialMonths: number
  activationTrialPlanCode: string | null
  isActive: boolean
  stripeProductId: string | null
  stripePriceId: string | null
}

export interface GenCodeOrderRow {
  id: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'
  quantity: number
  currency: string
  unitPrice: number
  discountCode: string | null
  discountAmount: number
  totalAmount: number
  checkoutExpiresAt: IsoDate | null
  paidAt: IsoDate | null
  creditExpiresAt: IsoDate | null
  createdAt: IsoDate
  package: TenantRef
  tenant: TenantRef
  createdBy: string | null
}

export interface GenCodesView { packages: GenCodePackageRow[]; orders: GenCodeOrderRow[]; isAdmin: boolean }

export interface GenCodeCustomer {
  id: string
  name: string
  taxId: string
  businessSegment: PartnerSegment
  contractStatus: 'ACTIVE' | 'INACTIVE' | 'NEW'
}

export interface GenCodesNewView {
  packages: GenCodePackageRow[]
  customers: GenCodeCustomer[]
  /** Resolved for BRL, as on the web. */
  coupons: SelectableCoupon[]
  initialPackageId: string | null
}

export interface GenCodePackageOrderFormValues {
  packageId: string
  tenantId: string
  discountCouponId?: string | null
  quantity: number
}

/* -------------------------------------------------------------------------- */
/* Partner plans and contracts                                                */
/* -------------------------------------------------------------------------- */

export interface PartnerPlanPrice {
  id: string
  currency: string
  countryScope: string | null
  annualCashAmount: number | null
  installmentCount: number | null
  installmentAmount: number | null
  unitReferenceAmount: number | null
  version: number
  stripeProductId: string | null
  stripeCashPriceId: string | null
  stripeInstallmentPriceId: string | null
}

export interface PartnerPlanDetail {
  id: string
  name: string
  code: string
  description: string | null
  annualAllowance: number
  /** 0..1 */
  rolloverRate: number
  rolloverValidityMonths: number
  graceDays: number
  committedReservationMonths: number
  activationTrialMonths: number
  activationTrialPlanCode: string | null
  isActive: boolean
  version: number
  prices: PartnerPlanPrice[]
}

export interface PartnerPlanRow extends PartnerPlanDetail {
  createdAt: IsoDate
  _count: { subscriptions: number }
}

export interface PlansView { plans: PartnerPlanRow[]; isAdmin: boolean }
export interface PlanView { plan: PartnerPlanDetail; stripeProductId: string | null; canEdit: boolean }

export interface PartnerPlanFormValues {
  name: string
  code: string
  description: string
  annualAllowance: number
  rolloverRate: number
  rolloverValidityMonths: number
  graceDays: number
  committedReservationMonths: number
  activationTrialMonths: number
  activationTrialPlanCode: string
  cashUsd: number
  installmentUsd: number
  unitRefUsd: number
  cashBrl: number
  installmentBrl: number
  unitRefBrl: number
  cashMxn: number
  installmentMxn: number
  unitRefMxn: number
  installmentCount: number
  isActive: boolean
}

export interface PlanNewView { defaults: PartnerPlanFormValues; canSubmit: boolean }

export type ContractStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED'
export type CycleStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED'
export interface ContractPlanRef { id: string; name: string; code: string; annualAllowance: number }

export interface ContractRow {
  id: string
  status: ContractStatus
  autoRenew: boolean
  createdAt: IsoDate
  founderRolloverEligible: boolean
  founderRolloverUsed: boolean
  stripeSubscriptionId: string | null
  tenant: TenantRef
  plan: ContractPlanRef
  currentCycle: { id: string; startAt: IsoDate; endAt: IsoDate; graceEndAt: IsoDate; status: CycleStatus } | null
  _count: { cycles: number }
  /** Cents, as charged on the current cycle. */
  amountPaid: number | null
  currency: string | null
  cadence: string | null
}

export interface ContractsView { contracts: ContractRow[]; isAdmin: boolean }

export interface ContractView {
  id: string
  status: ContractStatus
  autoRenew: boolean
  createdAt: IsoDate
  founderRolloverEligible: boolean
  founderRolloverUsed: boolean
  tenant: TenantRef & { email: string }
  plan: ContractPlanRef
  /** Newest first. */
  cycles: {
    id: string
    startAt: IsoDate
    endAt: IsoDate
    graceEndAt: IsoDate
    status: CycleStatus
    isRenewal: boolean
    /** Cents, as charged. */
    amountPaid: number | null
    currency: string | null
    cadence: string | null
  }[]
}

export interface SellablePartnerPlan {
  id: string
  name: string
  code: string
  annualAllowance: number
  currency: string
  stripeSynced: boolean
  annualCashAmount: number
  unitReferenceAmount: number | null
  installmentCount: number | null
  installmentAmount: number | null
}

export interface ContractNewView {
  currency: AppCurrency
  tenants: { id: string; name: string; taxId: string }[]
  plans: SellablePartnerPlan[]
  coupons: SelectableCoupon[]
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

export interface PartnerGenCodesView {
  partners: {
    tenantId: string
    tenantName: string
    available: number
    sold: number
    activated: number
    pending: number
    lastSaleAt: IsoDate | null
  }[]
  totals: { available: number; sold: number; activated: number; pending: number }
  search: string
}

export interface ReportsView {
  funnel: {
    issued: number
    sold: number
    activated: number
    available: number
    /** SOLD, never activated, older than `staleAfterDays`. */
    stale: number
    medianLagDays: number | null
  }
  staleAfterDays: number
  sellThrough: {
    tenantId: string
    tenantName: string
    granted: number
    consumed: number
    /** 0..1; null when nothing was granted. */
    rate: number | null
    medianLagDays: number | null
  }[]
  resellers: {
    tenantId: string
    tenantName: string
    issued: number
    sold: number
    activated: number
    stale: number
    /** A floor: only codes with a recorded value. */
    resaleValue: number
    valueMissing: number
  }[]
  channels: { channel: 'MANUAL' | 'PLATFORM'; count: number; value: number }[]
  /** One row per plan per currency; never summed across currencies. */
  revenueByPlan: { planName: string; currency: string; cycles: number; allowance: number; revenue: number }[]
  trial: { granted: number; converted: number; stillTrialing: number; lapsed: number; rate: number | null }
}

/* -------------------------------------------------------------------------- */
/* System                                                                     */
/* -------------------------------------------------------------------------- */

export interface CompanyDetail {
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

export interface CompanyView { company: CompanyDetail; canEdit: boolean }

export interface CompanyFormValues {
  legalName: string
  tradeName: string
  taxId: string
  stateRegistration?: string | null
  municipalRegistration?: string | null
  email: string
  phoneCountryCode: string
  phone: string
  isActive: boolean
  address?: Address
}

export interface UserRow {
  id: string
  firstName: string
  lastName: string
  email: string
  role: BmsRole
  isActive: boolean
  createdAt: IsoDate
}

export interface UsersView { users: UserRow[]; currentUserId: string; role: BmsRole; isAdmin: boolean }

export interface UserFormValues {
  firstName: string
  lastName: string
  email: string
  role: AssignableRole
  gender?: string | null
  nationalId?: string | null
  /** YYYY-MM-DD or empty. */
  birthDate?: string | null
  phoneCountryCode: string
  phone?: string | null
  isActive: boolean
  address?: Address
}

export interface UserNewView { roles: AssignableRole[]; defaults: UserFormValues; canSubmit: boolean }

export interface UserDetail {
  id: string
  firstName: string
  lastName: string
  email: string
  role: BmsRole
  /** REDACTED (when present) for non-admin roles. */
  nationalId: string | null
  birthDate: IsoDate | null
  phoneCountryCode: string
  /** REDACTED (when present) for non-admin roles. */
  phone: string | null
  isActive: boolean
  /** Always null for non-admin roles. */
  address: Address | null
}

export interface UserView { user: UserDetail; canEdit: boolean }

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

export const bmsApi = {
  /* ------------------------------- views -------------------------------- */
  me: () => view<MeView>('bms', 'me'),
  dashboard: () => view<DashboardView>('bms', 'dashboard'),
  profile: () => view<ProfileView>('bms', 'profile'),

  customers: () => view<CustomersView>('bms', 'customers'),
  customerNew: () => view<CustomerNewView>('bms', 'customerNew'),
  customer: (id: string) => view<CustomerView>('bms', 'customer', { id }),

  consumers: (params: ConsumersParams = {}) => view<ConsumersView>('bms', 'consumers', { ...params }),
  consumerNew: (id?: string) => view<ConsumerNewView>('bms', 'consumerNew', { id }),

  subscriptions: () => view<SubscriptionsView>('bms', 'subscriptions'),
  subscriptionNew: () => view<SubscriptionNewView>('bms', 'subscriptionNew'),
  subscription: (id: string) => view<SubscriptionView>('bms', 'subscription', { id }),
  extraUnitPrices: () => view<ExtraUnitPricesView>('bms', 'extraUnitPrices'),

  gencodes: () => view<GenCodesView>('bms', 'gencodes'),
  gencodesNew: (packageId?: string) => view<GenCodesNewView>('bms', 'gencodesNew', { packageId }),

  plans: () => view<PlansView>('bms', 'plans'),
  planNew: () => view<PlanNewView>('bms', 'planNew'),
  plan: (id: string) => view<PlanView>('bms', 'plan', { id }),

  contracts: () => view<ContractsView>('bms', 'contracts'),
  contract: (id: string) => view<ContractView>('bms', 'contract', { id }),
  contractNew: () => view<ContractNewView>('bms', 'contractNew'),

  discountCoupons: () => view<DiscountCouponsView>('bms', 'discountCoupons'),
  discountCouponNew: () => view<DiscountCouponNewView>('bms', 'discountCouponNew'),
  discountCoupon: (id: string) => view<DiscountCouponView>('bms', 'discountCoupon', { id }),
  discountCouponRedeem: () => view<DiscountCouponRedeemView>('bms', 'discountCouponRedeem'),

  partnerGencodes: (q?: string) => view<PartnerGenCodesView>('bms', 'partnerGencodes', { q }),
  reports: () => view<ReportsView>('bms', 'reports'),

  company: () => view<CompanyView>('bms', 'company'),
  users: () => view<UsersView>('bms', 'users'),
  userNew: () => view<UserNewView>('bms', 'userNew'),
  user: (id: string) => view<UserView>('bms', 'user', { id }),

  /* ------------------------- account (public) --------------------------- */
  /** Always answers `{ ok: true, redirect: '/forgot-password?sent=true' }` when accepted. */
  forgotPassword: (email: string) => action('bms', 'forgotPassword', { form: { email } }),
  /** Success answers `{ ok: true, redirect: '/sign-in?reset=true' }`. */
  resetPassword: (token: string, password: string) => action('bms', 'resetPassword', { form: { token, password } }),
  verifyEmail: (token: string) =>
    action<{ status: 'changed' | 'verified' }>('bms', 'verifyEmail', { form: { token } }),

  /* ------------------------- account (signed in) ------------------------ */
  changePassword: (currentPassword: string, newPassword: string) =>
    action('bms', 'changePassword', { form: { currentPassword, newPassword } }),
  requestEmailChange: (newEmail: string, currentPassword: string) =>
    action('bms', 'requestEmailChange', { form: { newEmail, currentPassword } }),
  /** Success answers `{ ok: true, redirect: '/' }`; discard the token afterwards. */
  deleteAccount: (currentPassword: string) => action('bms', 'deleteAccount', { form: { currentPassword } }),
  updateProfile: (data: ProfileFormValues) => action('bms', 'updateProfile', { args: [data] }),
  /** `url` is the staged media URL returned by `bmsHttp.profileUpload`. */
  updateAvatar: (url: string) => action('bms', 'updateAvatar', { args: [url] }),
  sendFeedback: (data: FeedbackInput) => action('bms', 'sendFeedback', { args: [data] }),

  /* ------------------------------- system ------------------------------- */
  updateCompany: (id: string, data: CompanyFormValues) => action('bms', 'updateCompany', { args: [id, data] }),
  createUser: (data: UserFormValues) => action('bms', 'createUser', { args: [data] }),
  updateUser: (id: string, data: UserFormValues) => action('bms', 'updateUser', { args: [id, data] }),
  deleteUser: (userId: string) => action('bms', 'deleteUser', { args: [userId] }),
  toggleUserActive: (userId: string) => action('bms', 'toggleUserActive', { args: [userId] }),
  resendWelcomeEmail: (userId: string) => action('bms', 'resendWelcomeEmail', { args: [userId] }),

  /* ------------------------------ partners ------------------------------ */
  createCustomer: (data: CustomerCreateFormValues) =>
    action<{ id: string; emailPending: boolean }>('bms', 'createCustomer', { args: [data] }),
  updateCustomer: (id: string, data: CustomerFormValues) => action('bms', 'updateCustomer', { args: [id, data] }),
  deleteCustomer: (id: string) => action('bms', 'deleteCustomer', { args: [id] }),
  resendCustomerEmail: (tenantId: string) => action('bms', 'resendCustomerEmail', { args: [tenantId] }),
  toggleCustomerActive: (id: string) => action('bms', 'toggleCustomerActive', { args: [id] }),

  /* ---------------------------- APP customers --------------------------- */
  registerConsumer: (data: ConsumerFormValues) =>
    action<ConsumerRegistrationResult>('bms', 'registerConsumer', { args: [data] }),
  resendConsumerAccessEmail: (appUserId: string) => action('bms', 'resendConsumerAccessEmail', { args: [appUserId] }),
  revokeConsumerAccess: (grantId: string) => action('bms', 'revokeConsumerAccess', { args: [grantId] }),
  linkConsumerPartner: (appUserId: string, tenantId: string) =>
    action('bms', 'linkConsumerPartner', { args: [appUserId, tenantId] }),
  /** `requestId` is a client-generated UUID. */
  grantPartnerPremium: (appUserId: string, requestId: string) =>
    action('bms', 'grantPartnerPremium', { args: [appUserId, requestId] }),
  revokePartnerPremium: (appUserId: string, grantId: string) =>
    action('bms', 'revokePartnerPremium', { args: [appUserId, grantId] }),

  /* --------------------------- consumer pricing ------------------------- */
  createSubscription: (data: SubscriptionFormValues) => action('bms', 'createSubscription', { args: [data] }),
  updateSubscription: (id: string, data: SubscriptionFormValues) =>
    action('bms', 'updateSubscription', { args: [id, data] }),
  deleteSubscription: (id: string) => action('bms', 'deleteSubscription', { args: [id] }),
  toggleSubscriptionActive: (id: string) => action('bms', 'toggleSubscriptionActive', { args: [id] }),
  syncSubscriptionWithStripe: (id: string) => action('bms', 'syncSubscriptionWithStripe', { args: [id] }),
  updateExtraUnitPrice: (id: string, data: ExtraUnitPriceFormValues) =>
    action('bms', 'updateExtraUnitPrice', { args: [id, data] }),
  syncExtraUnitPriceWithStripe: (id: string) => action('bms', 'syncExtraUnitPriceWithStripe', { args: [id] }),

  /* ----------------------- partner plans, contracts --------------------- */
  createPartnerPlan: (data: PartnerPlanFormValues) => action('bms', 'createPartnerPlan', { args: [data] }),
  updatePartnerPlan: (id: string, data: PartnerPlanFormValues) =>
    action('bms', 'updatePartnerPlan', { args: [id, data] }),
  togglePartnerPlanActive: (id: string) => action('bms', 'togglePartnerPlanActive', { args: [id] }),
  syncPartnerPlan: (id: string) => action('bms', 'syncPartnerPlan', { args: [id] }),
  sendPartnerPlanLink: (tenantId: string, planId: string, cadence: PartnerCadence, discountCouponId?: string | null) =>
    action<{ email: string }>('bms', 'sendPartnerPlanLink', {
      args: [tenantId, planId, cadence, discountCouponId ?? null],
    }),

  /* --------------------------- GenCode packages ------------------------- */
  syncGenCodePackageWithStripe: (packageId: string) =>
    action('bms', 'syncGenCodePackageWithStripe', { args: [packageId] }),
  sendGenCodePackageLink: (data: GenCodePackageOrderFormValues) =>
    action<{ email: string }>('bms', 'sendGenCodePackageLink', { args: [data] }),

  /* --------------------------- discount coupons ------------------------- */
  createDiscountCoupon: (data: DiscountCouponFormValues) =>
    action<{ id: string; code: string }>('bms', 'createDiscountCoupon', { args: [data] }),
  updateDiscountCoupon: (id: string, data: { description: string | null }) =>
    action('bms', 'updateDiscountCoupon', { args: [id, data] }),
  toggleDiscountCouponActive: (id: string) => action('bms', 'toggleDiscountCouponActive', { args: [id] }),
  applyManualCoupon: (data: ManualCouponFormValues) =>
    action<ManualCouponResult>('bms', 'applyManualCoupon', { args: [data] }),
  retryManualCouponEmail: (redemptionId: string) => action('bms', 'retryManualCouponEmail', { args: [redemptionId] }),
}

/**
 * Plain HTTP routes the app calls directly with the same bearer token.
 * They are not part of the view/action bridge and keep their own response shapes.
 */
export const bmsHttp = {
  /** POST: the media-upload handshake for the signed-in user's avatar (JPEG/PNG/WebP/GIF, 5 MB). */
  profileUpload: () => '/api/profile/upload',
  /** GET → `{ name }`; administrators only. */
  entityName: (type: 'users' | 'customers' | 'subscriptions' | 'plans', id: string) =>
    `/api/entity-name?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
}
