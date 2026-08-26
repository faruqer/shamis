"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { LoadingSpinner } from "@/components/layout/page-transition";
import { formatCurrency } from "@/lib/utils";
import { Role } from "@prisma/client";
import {
  ClientCreditSection,
  ClientCreditSectionData,
} from "@/components/credit/client-credit-section";

interface ClientCreditData extends ClientCreditSectionData {
  clientCredit: number;
}

export function ClientsClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const [data, setData] = useState<ClientCreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    fetch("/api/clients/credit")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load clients");
        }
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => {
        setData(null);
        setError(err.message || "Failed to load clients");
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <DashboardLayout
      user={user}
      title="Clients"
      description="Client credit balances, unpaid sales, and payment history"
    >
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <p className="text-sm text-destructive text-center py-8">{error}</p>
      ) : !data ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard
              compact
              title="Client Credit"
              value={formatCurrency(data.clientCredit)}
              icon={<Users className="h-4 w-4" />}
              delay={0}
              valueClassName={data.clientCredit > 0 ? "text-success" : undefined}
            />
          </div>

          <ClientCreditSection
            data={data}
            onPaymentSuccess={() => loadData(true)}
          />
        </>
      )}
    </DashboardLayout>
  );
}
