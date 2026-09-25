"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import { navItemsForRole, navItemLabel, isNavItemActive, type NavItem } from "@/lib/nav";
import {
  useSidebar,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "./sidebar-context";

interface SidebarProps {
  user: { name: string; role: Role; email: string };
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

/**
 * Desktop-only sidebar. Below `lg` the mobile drawer in <MobileNav /> takes
 * over, since this one opens on hover and a touch screen has none.
 */
export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { expanded, setExpanded } = useSidebar();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = navItemsForRole(user.role);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="sidebar-gradient fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden text-white shadow-xl lg:flex"
    >
      <div className="flex min-h-[73px] items-center border-b border-white/10 p-4">
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
            <h1 className="text-sm font-bold">Stock &amp; Money</h1>
            <p className="text-xs text-white/60">Management</p>
          </motion.div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            label={navItemLabel(item, user.role)}
            isActive={isNavItemActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={cn("flex items-center gap-2", expanded ? "flex-row" : "flex-col")}>
          <motion.span
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, height: expanded ? "auto" : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden whitespace-nowrap rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium"
          >
            {user.role === Role.ADMIN ? OWNER_NAME : "Salesperson"}
          </motion.span>
          <div className={cn(expanded ? "flex-1" : "w-full")}>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white",
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
