import { BuildingIcon, IdCardIcon, LayoutDashboard, Package, QrCode, SquareChartGantt, UsersIcon, type LucideIcon } from 'lucide-react'

// The Cadastros / Compras / Estoque groups were removed: every entry in them was
// already in the fast menu above, so the sidebar offered the same four
// destinations twice, one of them behind a collapsible.
//
// Three routes lost their only menu entry and are now reachable by URL only —
// /categories/customers, /categories/suppliers and /suppliers. The pages, their
// actions and the module gate on the supplier ones are all untouched; if any of
// them should be navigable again, it belongs in `main`, not in a group of one.
// That also retired ModuleKey: nothing in the menu is module-gated any more.
// The two module columns that still matter are read in lib/dal.ts, which gates
// the supplier pages themselves.

export interface MenuItem {
  /** i18n key under the `Sidebar.items` namespace (translated in app-sidebar). */
  labelKey: string
  url: string
  icon: LucideIcon
}

// ─── Main (fast menu — sub-sections separated by a divider) ──────────────────

export const main: MenuItem[][] = [
  [
    { labelKey: 'items.dashboard', url: '/dashboard', icon: LayoutDashboard },
  ],
  [
    { labelKey: 'items.buyGenCodes', url: '/purchasing/plans', icon: SquareChartGantt },
    { labelKey: 'items.genCodePackages', url: '/purchasing/packages', icon: Package },
    { labelKey: 'items.myGenCodes',  url: '/inventory/activations',  icon: QrCode },
  ],
  [
    { labelKey: 'items.customers', url: '/customers', icon: UsersIcon },
  ],
]

// ─── System (always visible) ─────────────────────────────────────────────────

export const system: MenuItem[] = [
  { labelKey: 'items.companyData', url: '/system/company', icon: BuildingIcon },
  { labelKey: 'items.employees',   url: '/system/users',   icon: IdCardIcon   },
]
