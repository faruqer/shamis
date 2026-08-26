"use client";

import { Sidebar } from "./sidebar";
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
      <div
        className="min-h-screen transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: width }}
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
