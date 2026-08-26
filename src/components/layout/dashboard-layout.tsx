"use client";

import { Role } from "@prisma/client";

interface DashboardLayoutProps {
  user: { name: string; role: Role; email: string };
  children: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function DashboardLayout({ children, title, description, action }: DashboardLayoutProps) {
  return (
    <>
      {(title || action) && (
        <header className="sticky top-0 z-30 border-b border-border/60 bg-card/90 backdrop-blur-md px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
              {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
            </div>
            {action}
          </div>
        </header>
      )}
      <div className="p-8">{children}</div>
    </>
  );
}
