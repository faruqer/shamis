import {
  LayoutDashboard,
  Package,
  Store,
  Users,
  Wallet,
  Receipt,
  UserCog,
  BarChart3,
  Coins,
} from "lucide-react";
import { Role } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
}

/**
 * Single source of truth for navigation, shared by the desktop sidebar and the
 * mobile drawer. Every item a role can reach is listed here — there is no
 * "More" bucket, so what a user sees is the whole app.
 *
 * Both roles reach Expenses, Bank Accounts and hw as tabs inside /balance, so
 * those have no nav rows of their own.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: "/imports", label: "Imports", icon: <Package className="h-5 w-5" /> },
  { href: "/inventory", label: "Inventory", icon: <Store className="h-5 w-5" /> },
  { href: "/sales", label: "Sales", icon: <Receipt className="h-5 w-5" /> },
  { href: "/balance", label: "Balance", icon: <Wallet className="h-5 w-5" /> },
  {
    href: "/credit",
    label: "Customer Credit",
    icon: <Users className="h-5 w-5" />,
    roles: [Role.SALESPERSON],
  },
  { href: "/china-rmb", label: "China RMB", icon: <Coins className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/report", label: "Report", icon: <BarChart3 className="h-5 w-5" />, roles: [Role.ADMIN] },
  {
    href: "/clients",
    label: "Customer Credit",
    icon: <Users className="h-5 w-5" />,
    roles: [Role.ADMIN],
  },
  { href: "/users", label: "Shops & Users", icon: <UserCog className="h-5 w-5" />, roles: [Role.ADMIN] },
];

export function navItemsForRole(role: Role) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

/** Role-specific wording lives here rather than being branched at each call site. */
export function navItemLabel(item: NavItem, role: Role) {
  if (item.href === "/inventory" && role === Role.SALESPERSON) return "Shop Stock";
  return item.label;
}

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
