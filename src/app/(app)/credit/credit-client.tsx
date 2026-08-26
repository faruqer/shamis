"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Users, CreditCard, Send } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/layout/page-transition";
import { formatCurrency } from "@/lib/utils";
import { creditToOwnerLabel, handoverToOwnerLabel, OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import { ClientCreditSection } from "@/components/credit/client-credit-section";
import { HandoverModal } from "@/components/credit/handover-modal";
import { ClientCreditHistoryEntry, ClientCreditSale } from "@/components/credit/client-credit-modal";

interface CreditData {
  shopName?: string | null;
  ownerCredit: number;
  clientCredit: number;
  totalCredit: number;
  clientBalances: { clientId: string; clientName: string; amount: number }[];
  creditSales: ClientCreditSale[];
  creditHistory: ClientCreditHistoryEntry[];
}

export function CreditClient({
  user,
}: {
  user: { name: string; role: Role; email: string; shopName?: string | null };
}) {
  const [data, setData] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHandover, setShowHandover] = useState(false);

  const loadCreditData = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetch("/api/balance")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load credit");
        }
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => {
        setError(err instanceof Error ? err.message : "Failed to load credit");
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
      <DashboardLayout user={user} title="Credit">
        <LoadingSpinner />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout user={user} title="Credit">
        <p className="text-sm text-destructive text-center py-8">{error}</p>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  return (
    <DashboardLayout
      user={user}
      title="Credit"
      description={
        data.shopName
          ? `${data.shopName} · all credits owed to ${OWNER_NAME} and from clients`
          : "Track all shop credits"
      }
    >
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          compact
          title={creditToOwnerLabel()}
          value={formatCurrency(data.ownerCredit)}
          icon={<Wallet className="h-4 w-4" />}
          delay={0}
          valueClassName={data.ownerCredit > 0 ? "text-warning" : undefined}
        />
        <StatCard
          compact
          title="Client Credit"
          value={formatCurrency(data.clientCredit)}
          icon={<Users className="h-4 w-4" />}
          delay={0.05}
          valueClassName={data.clientCredit > 0 ? "text-success" : undefined}
        />
        <StatCard
          compact
          title="Total Credit"
          value={formatCurrency(data.totalCredit)}
          icon={<CreditCard className="h-4 w-4" />}
          delay={0.1}
        />
      </div>

      {data.ownerCredit > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card hover className="border-[#ddd0b8] bg-[#faf6ee] border-l-4 border-l-warning">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{handoverToOwnerLabel()}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You owe {OWNER_NAME} {formatCurrency(data.ownerCredit)} from collections and shop stock.
                  Record here after you send the money.
                </p>
              </div>
              <Button onClick={() => setShowHandover(true)} className="shrink-0">
                <Send className="h-4 w-4" />
                {handoverToOwnerLabel()}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <ClientCreditSection
        data={data}
        includeOwnerHistory
        onPaymentSuccess={() => loadCreditData(true)}
      />

      <HandoverModal
        open={showHandover}
        onClose={() => setShowHandover(false)}
        owedToOwner={data.ownerCredit}
        onSuccess={() => loadCreditData(true)}
      />
    </DashboardLayout>
  );
}
