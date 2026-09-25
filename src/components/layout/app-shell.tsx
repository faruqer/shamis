"use client";

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import type { SessionUser } from "@/lib/auth-edge";

function AppShellInner({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const { width } = useSidebar();

  return (
    <div className="min-h-screen gradient-bg">
      <Sidebar user={user} />
      <MobileNav user={user} />
      {/*
        The sidebar only exists at `lg` and up, so the offset is applied at that
        breakpoint only — on mobile the content starts at the left edge.
      */}
      <div
        className="min-h-screen transition-[margin-left] duration-300 ease-in-out lg:ml-[var(--sidebar-width)]"
        style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppShellInner user={user}>{children}</AppShellInner>
    </SidebarProvider>
  );
}
