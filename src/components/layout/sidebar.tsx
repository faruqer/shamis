"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: "/imports", label: "Imports", icon: <Package className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/inventory", label: "Inventory", icon: <Store className="h-5 w-5" /> },
  { href: "/sales", label: "Sales", icon: <Receipt className="h-5 w-5" /> },
  { href: "/expenses", label: "Expenses", icon: <Receipt className="h-5 w-5" /> },
  { href: "/balance", label: "Balance", icon: <Wallet className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/banks", label: "Bank Accounts", icon: <Landmark className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/report", label: "Report", icon: <BarChart3 className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/clients", label: "Clients", icon: <Users className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/users", label: "Shops & Users", icon: <UserCog className="h-5 w-5" />, roles: [Role.ADMIN] },
  { href: "/credit", label: "Credit", icon: <Wallet className="h-5 w-5" />, roles: [Role.SALESPERSON] },
  { href: "/banks", label: "Banks", icon: <Landmark className="h-5 w-5" />, roles: [Role.SALESPERSON] },
];

interface SidebarProps {
  user: { name: string; role: Role; email: string };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { expanded, setExpanded } = useSidebar();

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

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
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const label =
            item.href === "/inventory" && user.role === Role.SALESPERSON
              ? "Shop Stock"
              : item.label;

          return (
            <Link
              key={item.href}
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
        })}
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
          <form action="/api/auth/logout" method="POST" className={cn(expanded ? "flex-1" : "w-full")}>
            <button
              type="submit"
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
          </form>
        </div>
      </div>
    </motion.aside>
  );
}
