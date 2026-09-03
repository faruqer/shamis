"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Store,
  Users,
  Wallet,
  Receipt,
  LogOut,
  UserCog,
  BarChart3,
  Landmark,
  ArrowLeftRight,
  ChevronDown,
  MoreHorizontal,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import {
  useSidebar,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "./sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
}

const PRIMARY_NAV_HREFS = new Set(["/imports", "/inventory", "/balance", "/china-rmb"]);

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: "/imports", label: "Imports", icon: <Package className="h-5 w-5" /> },
  { href: "/inventory", label: "Inventory", icon: <Store className="h-5 w-5" /> },
  { href: "/sales", label: "Sales", icon: <Receipt className="h-5 w-5" /> },
  { href: "/expenses", label: "Expenses", icon: <Receipt className="h-5 w-5" /> },
  { href: "/balance", label: "Balance", icon: <Wallet className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/china-rmb", label: "China RMB", icon: <Coins className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/banks", label: "Bank Accounts", icon: <Landmark className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/hawala", label: "hw", icon: <ArrowLeftRight className="h-5 w-5" /> },
  { href: "/report", label: "Report", icon: <BarChart3 className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/clients", label: "Clients", icon: <Users className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/users", label: "Shops & Users", icon: <UserCog className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/credit", label: "Credit", icon: <Wallet className="h-5 w-5" />, roles: [Role.SALESPERSON] },
  { href: "/banks", label: "Banks", icon: <Landmark className="h-5 w-5" />, roles: [Role.SALESPERSON] },
];

interface SidebarProps {
  user: { name: string; role: Role; email: string };
}

function getItemLabel(item: NavItem, role: Role) {
  return item.href === "/inventory" && role === Role.SALESPERSON
    ? "Shop Stock"
    : item.label;
}

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  label,
  isActive,
  expanded,
}: {
  item: NavItem;
  label: string;
  isActive: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={item.href}
      prefetch
      title={!expanded ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        isActive
          ? "bg-white/20 text-white shadow-sm"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <motion.span
        initial={false}
        animate={{ opacity: expanded ? 1 : 0, width: expanded ? "auto" : 0 }}
        transition={{ duration: 0.2 }}
        className="min-w-0 overflow-hidden whitespace-nowrap"
      >
        {label}
      </motion.span>
    </Link>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { expanded, setExpanded } = useSidebar();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  const isAdmin = user.role === Role.ADMIN;
  const primaryItems = isAdmin
    ? filteredItems.filter((item) => PRIMARY_NAV_HREFS.has(item.href))
    : filteredItems;
  const moreItems = isAdmin
    ? filteredItems.filter((item) => !PRIMARY_NAV_HREFS.has(item.href))
    : [];

  const isMoreSectionActive = moreItems.some((item) =>
    isNavItemActive(pathname, item.href)
  );

  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="sidebar-gradient fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden text-white shadow-xl"
    >
      <div className="flex items-center border-b border-white/10 p-4 min-h-[73px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
            <Package className="h-5 w-5" />
          </div>
          <motion.div
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, width: expanded ? "auto" : 0 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 overflow-hidden whitespace-nowrap"
          >
            <h1 className="text-sm font-bold">Stock & Money</h1>
            <p className="text-xs text-white/60">Management</p>
          </motion.div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
        {primaryItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            label={getItemLabel(item, user.role)}
            isActive={isNavItemActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}

        {moreItems.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                if (!expanded) {
                  setExpanded(true);
                }
                setMoreOpen((open) => !open);
              }}
              title={!expanded ? "More" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                isMoreSectionActive
                  ? "bg-white/20 text-white shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <span className="shrink-0">
                <MoreHorizontal className="h-5 w-5" />
              </span>
              <motion.span
                initial={false}
                animate={{ opacity: expanded ? 1 : 0, width: expanded ? "auto" : 0 }}
                transition={{ duration: 0.2 }}
                className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left"
              >
                More
              </motion.span>
              <motion.span
                initial={false}
                animate={{
                  opacity: expanded ? 1 : 0,
                  width: expanded ? "auto" : 0,
                  rotate: moreOpen ? 180 : 0,
                }}
                transition={{ duration: 0.2 }}
                className="shrink-0 overflow-hidden"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>

            {moreOpen && (
              <div className="space-y-1">
                {moreItems.map((item) => {
                  const label = getItemLabel(item, user.role);
                  const isActive = isNavItemActive(pathname, item.href);

                  return (
                    <Link
                      key={`${item.href}-${item.label}`}
                      href={item.href}
                      prefetch
                      title={!expanded ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors duration-200",
                        expanded ? "pl-6 pr-3" : "px-3",
                        isActive
                          ? "bg-white/20 text-white shadow-sm"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <motion.span
                        initial={false}
                        animate={{ opacity: expanded ? 1 : 0, width: expanded ? "auto" : 0 }}
                        transition={{ duration: 0.2 }}
                        className="min-w-0 overflow-hidden whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={cn("flex items-center gap-2", expanded ? "flex-row" : "flex-col")}>
          <motion.span
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, height: expanded ? "auto" : 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium shrink-0 whitespace-nowrap"
          >
            {user.role === Role.ADMIN ? OWNER_NAME : "Salesperson"}
          </motion.span>
          <div className={cn(expanded ? "flex-1" : "w-full")}>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full",
              expanded ? "justify-end" : "justify-center"
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <motion.span
              initial={false}
              animate={{ opacity: expanded ? 1 : 0, width: expanded ? "auto" : 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              Sign Out
            </motion.span>
          </button>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
