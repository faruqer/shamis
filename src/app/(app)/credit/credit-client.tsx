"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/layout/page-transition";
import { formatCurrency } from "@/lib/utils";
import { Role } from "@prisma/client";
import { ClientCreditSection } from "@/components/credit/client-credit-section";
import { ClientCreditHistoryEntry, ClientCreditSale } from "@/components/credit/client-credit-modal";

interface CustomerCreditData {
  shopName?: string | null;
  clientCredit: number;
  clientBalances: { clientId: string; clientName: string; amount: number }[];
  creditSales: ClientCreditSale[];
  creditHistory: ClientCreditHistoryEntry[];
}

/**
 * What customers owe this shop. Credit the salesperson owes the owner lives on
 * the Balance page instead, so this page is only about money coming in.
 */
export function CreditClient({
  user,
}: {
  user: { name: string; role: Role; email: string; shopName?: string | null };
}) {
  const [data, setData] = useState<CustomerCreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCreditData = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetch("/api/balance")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load customer credit");
        }
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => {
        setError(err instanceof Error ? err.message : "Failed to load customer credit");
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCreditData();
  }, [loadCreditData]);

  if (loading) {
    return (
      <DashboardLayout user={user} title="Customer Credit">
        <LoadingSpinner />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout user={user} title="Customer Credit">
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  return (
    <DashboardLayout
      user={user}
      title="Customer Credit"
      description={
        data.shopName
          ? `${data.shopName} · what customers owe you`
          : "What customers owe you"
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          compact
          title="Customer Credit"
          value={formatCurrency(data.clientCredit)}
          icon={<Users className="h-4 w-4" />}
          delay={0}
          valueClassName={data.clientCredit > 0 ? "text-success" : undefined}
        />
      </div>

      {data.clientCredit === 0 && data.clientBalances.length === 0 && (
        <Card className="mb-6">
          <CardContent className="p-4 text-sm text-muted-foreground">
            No customer has taken credit yet. Unpaid retail sales will show up here.
          </CardContent>
        </Card>
      )}

      <ClientCreditSection data={data} onPaymentSuccess={() => loadCreditData(true)} />
    </DashboardLayout>
  );
}
