"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import { BanksPanel } from "@/components/banks/banks-panel";

interface LedgerEntry {
  id: string;
  type: string;
  amount: string;
  description: string;
  entryDate: string;
  sale?: { saleNumber: string };
  expense?: { description: string; category: string };
}

interface LedgerData {
  entries: LedgerEntry[];
  balance: number;
  users: { id: string; name: string }[];
  salespersonBalances: { id: string; name: string; balance: number }[];
}

export function LedgerClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");

  useEffect(() => {
    const url = selectedUser ? `/api/ledger?userId=${selectedUser}` : "/api/ledger";
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [selectedUser]);

  return (
    <DashboardLayout
      user={user}
      title="Balance"
      description={`Bank accounts, ${OWNER_NAME} credit held by shops, and salesperson ledger`}
    >
      {user.role === Role.ADMIN && <BanksPanel user={user} embedded className="mb-8" />}

      {user.role === Role.ADMIN && data?.salespersonBalances && data.salespersonBalances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {data.salespersonBalances.map((sp, index) => (
            <motion.div key={sp.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card hover className="cursor-pointer" onClick={() => setSelectedUser(sp.id)}>
                <CardContent className="p-5 text-center">
                  <Wallet className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="font-medium">{sp.name}</p>
                  <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(sp.balance)}</p>
                  <p className="text-xs text-muted-foreground">{OWNER_NAME} credit</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        {user.role === Role.ADMIN && data?.users && (
          <Select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-64">
            <option value="">All / Select Salesperson</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        )}
        {data && (
          <div className="ml-auto rounded-xl bg-primary-light px-6 py-3">
            <span className="text-sm text-primary-dark">Current Balance: </span>
            <span className="text-xl font-bold text-primary">{formatCurrency(data.balance)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={<Wallet className="h-8 w-8" />} title="No ledger entries" description="Money collections and expenses will appear here" />
      ) : (
        <Card>
          <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.entries.map((entry, index) => {
                const amount = parseFloat(entry.amount);
                const isPositive = amount >= 0;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center gap-3">
                      {isPositive ? (
                        <ArrowUpCircle className="h-5 w-5 text-success" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.entryDate)}
                          {entry.sale && ` · ${entry.sale.saleNumber}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
                        {isPositive ? "+" : ""}{formatCurrency(amount)}
                      </p>
                      <Badge
                        variant={
                          entry.type === "COLLECTION"
                            ? "success"
                            : entry.type === "EXPENSE"
                              ? "danger"
                              : entry.type === "HANDOVER"
                                ? "info"
                                : "default"
                        }
                      >
                        {entry.type}
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
