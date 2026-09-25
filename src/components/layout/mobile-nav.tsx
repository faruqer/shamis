"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Menu, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import { navItemsForRole, navItemLabel, isNavItemActive } from "@/lib/nav";

export const MOBILE_TOPBAR_HEIGHT = 56;

/**
 * Mobile header + slide-in drawer. Shown below `lg`, where the hover-driven
 * desktop sidebar cannot be opened by touch. The drawer lists every page the
 * role can reach, same source as the sidebar.
 */
export function MobileNav({ user }: { user: { name: string; role: Role; email: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on navigation so the drawer never lingers over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = navItemsForRole(user.role);
  const activeLabel = items.find((item) => isNavItemActive(pathname, item.href));

  return (
    <>
      <header
        className="sidebar-gradient sticky top-0 z-40 flex h-14 items-center gap-3 px-4 text-white shadow-md lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)", height: `calc(${MOBILE_TOPBAR_HEIGHT}px + env(safe-area-inset-top))` }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 rounded-lg p-2 transition-colors hover:bg-white/10 active:bg-white/20"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Package className="h-5 w-5 shrink-0" />
          <span className="truncate text-sm font-semibold">
            {activeLabel ? navItemLabel(activeLabel, user.role) : "Stock & Money"}
          </span>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="sidebar-gradient relative z-10 flex h-full w-[84vw] max-w-[320px] flex-col text-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div
                className="flex items-center justify-between border-b border-white/10 p-4"
                style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold">Stock &amp; Money</h2>
                    <p className="text-xs text-white/60">
                      {user.role === Role.ADMIN ? OWNER_NAME : "Salesperson"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="rounded-lg p-2 transition-colors hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-white/20 text-white shadow-sm"
                          : "text-white/75 hover:bg-white/10 hover:text-white active:bg-white/20"
                      )}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate">{navItemLabel(item, user.role)}</span>
                    </Link>
                  );
                })}
              </nav>

              <div
                className="border-t border-white/10 p-3"
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  Sign Out
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
