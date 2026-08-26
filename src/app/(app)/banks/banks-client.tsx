"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { BanksPanel } from "@/components/banks/banks-panel";
import { Role } from "@prisma/client";

export function BanksClient({
  user,
}: {
  user: { id?: string; name: string; role: Role; email: string };
}) {
  return (
    <DashboardLayout
      user={user}
      title="Bank Accounts"
      description="Manage banks, view balances, and transfer funds between accounts"
    >
      <BanksPanel user={user} />
    </DashboardLayout>
  );
}
