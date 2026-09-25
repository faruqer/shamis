"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Receipt, Wallet } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Tabs, type TabDef } from "@/components/ui/tabs";
import { BanksPanel } from "@/components/banks/banks-panel";
import { creditToOwnerLabel, OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import { BalanceOverviewPanel } from "./balance-overview-panel";
import { OwnerCreditPanel } from "./owner-credit-panel";
import { ExpensesPanel } from "../expenses/expenses-panel";
import { HawalaPanel } from "../hawala/hawala-panel";

const BALANCE_TABS = ["overview", "expenses", "banks", "hw"] as const;
export type BalanceTab = (typeof BALANCE_TABS)[number];

export function isBalanceTab(value: string | null | undefined): value is BalanceTab {
  return !!value && (BALANCE_TABS as readonly string[]).includes(value);
}

/**
 * The single money page. The first tab differs by role — an admin sees credit
 * held across shops and the salesperson ledgers, a salesperson sees their own
 * credit to the owner and the handover action — while Expenses, Bank Accounts
 * and hw are the same panels for both.
 */
export function BalanceClient({
  user,
}: {
  user: { id?: string; name: string; role: Role; email: string; shopName?: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get("tab");

  const isAdmin = user.role === Role.ADMIN;

  const [tab, setTab] = useState<BalanceTab>(isBalanceTab(paramTab) ? paramTab : "overview");

  // Follow the URL when it changes from outside this component (back button, or
  // a link into a specific tab).
  useEffect(() => {
    if (isBalanceTab(paramTab) && paramTab !== tab) {
      setTab(paramTab);
    }
  }, [paramTab, tab]);

  const tabDefs = useMemo<TabDef<BalanceTab>[]>(
    () => [
      {
        key: "overview",
        label: isAdmin ? "Balance" : creditToOwnerLabel(),
        shortLabel: isAdmin ? undefined : `To ${OWNER_NAME}`,
        icon: <Wallet className="h-4 w-4" />,
      },
      { key: "expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" /> },
      {
        key: "banks",
        label: "Bank Accounts",
        shortLabel: "Banks",
        icon: <Landmark className="h-4 w-4" />,
      },
      { key: "hw", label: "hw", icon: <ArrowLeftRight className="h-4 w-4" /> },
    ],
    [isAdmin]
  );

  const descriptions: Record<BalanceTab, string> = {
    overview: isAdmin
      ? `${OWNER_NAME} credit held by shops and salesperson ledger`
      : `Money you hold for ${OWNER_NAME}, and the handover record`,
    expenses: isAdmin
      ? "Warehouse, shop, tax and other costs"
      : "Shop expenses paid from your collected money",
    banks: isAdmin
      ? "Manage banks, view balances, and transfer funds between accounts"
      : "View balances, add banks, and transfer between accounts",
    hw: isAdmin
      ? "Track money transfers, confirm receipts, and manage receiving persons"
      : "Send money to receiving persons assigned by admin",
  };

  const handleChange = useCallback(
    (next: BalanceTab) => {
      setTab(next);
      const query = next === "overview" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [pathname, router]
  );

  return (
    <DashboardLayout user={user} title="Balance" description={descriptions[tab]}>
      <Tabs tabs={tabDefs} value={tab} onChange={handleChange} />

      {/*
        Each panel is mounted only while its tab is active so it fetches on open
        rather than loading all four money endpoints on every visit.
      */}
      {tab === "overview" &&
        (isAdmin ? <BalanceOverviewPanel user={user} /> : <OwnerCreditPanel />)}
      {tab === "expenses" && <ExpensesPanel user={user} embedded />}
      {tab === "banks" && <BanksPanel user={user} embedded />}
      {tab === "hw" && <HawalaPanel user={user} embedded />}
    </DashboardLayout>
  );
}
