import {
  Building2,
  BuildingIcon,
  Fingerprint,
  HandCoinsIcon,
  IdCardIcon,
  Layers,
  LayoutDashboard,
  PackageOpen,
  SquarePlus,
  TicketPercent,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface MenuItem {
  /** i18n key under the `Sidebar.items` namespace (translated in app-sidebar). */
  labelKey: string
  url: string
  icon: LucideIcon
  /** Renders a <SidebarSeparator /> right after this item. */
  separatorAfter?: boolean
}

export const main: MenuItem[] = [
  { labelKey: 'items.dashboard', url: '/dashboard', icon: LayoutDashboard },
]

export const system: MenuItem[] = [
  { labelKey: 'items.companyData', url: '/system/company', icon: BuildingIcon },
  { labelKey: 'items.systemUsers', url: '/system/users',   icon: IdCardIcon   },
]

export const products: MenuItem[] = [
  { labelKey: 'items.partnerPlans',  url: '/plans',             icon: Fingerprint },
  { labelKey: 'items.gencodePackages', url: '/gencodes',        icon: PackageOpen, separatorAfter: true },
  { labelKey: 'items.subscriptions', url: '/subscriptions',     icon: Layers      },
  { labelKey: 'items.extraUnits',    url: '/extra-unit-prices', icon: SquarePlus  },
]

export const customers: MenuItem[] = [
  { labelKey: 'items.customers', url: '/customers', icon: Building2 },
  { labelKey: 'items.consumers', url: '/consumers', icon: Users },
]

// Sales Reports is deliberately absent, not deleted: /sales/reports and its
// queries stay in the tree and go back on this list once the report is ready.
export const sales: MenuItem[] = [
  { labelKey: 'items.discountCoupons', url: '/sales/discount-coupons', icon: TicketPercent },
  { labelKey: 'items.contracts',       url: '/sales/contracts',        icon: HandCoinsIcon },
]

export const groups = [
  { labelKey: 'groups.system',    items: system    },
  { labelKey: 'groups.products',  items: products  },
  { labelKey: 'groups.customers', items: customers },
  { labelKey: 'groups.sales',     items: sales     },
]
