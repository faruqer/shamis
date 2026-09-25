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
        <header className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-border/60 bg-card/90 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-5 lg:top-0 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {title && (
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
              )}
            </div>
            {/* Actions stretch full-width on phones so they are easy to hit. */}
            {action && (
              <div className="flex shrink-0 flex-col gap-2 [&>*]:w-full sm:flex-row sm:[&>*]:w-auto">
                {action}
              </div>
            )}
          </div>
        </header>
      )}
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</div>
    </>
  );
}
