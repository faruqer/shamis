"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { formatCurrency } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";
import {
  LedgerEntryDetails,
  ledgerBadgeVariant,
  type LedgerEntry,
} from "@/components/ledger/ledger-entry-details";

const PAGE_SIZE = 75;

interface LedgerData {
  entries: LedgerEntry[];
  balance: number;
  users: { id: string; name: string }[];
  salespersonBalances: { id: string; name: string; balance: number }[];
}


/**
 * Credit held by shops plus the salesperson ledger. Rendered as the first tab
 * of the Balance page.
 */
export function BalanceOverviewPanel({
  user,
}: {
  user: { name: string; role: Role; email: string };
}) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  // A busy shop builds hundreds of rows; render them in pages so a phone is not
  // asked to lay out the whole ledger at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    const url = selectedUser ? `/api/ledger?userId=${selectedUser}` : "/api/ledger";
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [selectedUser]);

  const isAdmin = user.role === Role.ADMIN;
  const selectedName = data?.users.find((u) => u.id === selectedUser)?.name;
  const allEntries = data?.entries ?? [];
  const visibleEntries = allEntries.slice(0, visibleCount);

  return (
    <>
      {isAdmin && data?.salespersonBalances && data.salespersonBalances.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {data.salespersonBalances.map((sp, index) => (
            <motion.div
              key={sp.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                hover
                className={`cursor-pointer ${selectedUser === sp.id ? "border-primary ring-2 ring-primary/30" : ""}`}
                onClick={() => setSelectedUser(selectedUser === sp.id ? "" : sp.id)}
              >
                <CardContent className="p-4 text-center sm:p-5">
                  <Wallet className="mx-auto mb-2 h-6 w-6 text-primary" />
                  <p className="truncate font-medium">{sp.name}</p>
                  <p className="mt-1 text-xl font-bold text-primary sm:text-2xl">
                    {formatCurrency(sp.balance)}
                  </p>
                  <p className="text-xs text-muted-foreground">{OWNER_NAME} credit</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {isAdmin && data?.users && (
          <Select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full sm:w-64"
          >
            <option value="">All / Select Salesperson</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}
        {data && (
          <div className="rounded-xl bg-primary-light px-4 py-3 sm:ml-auto sm:px-6">
            <span className="text-sm text-primary-dark">Current Balance: </span>
            <span className="text-lg font-bold text-primary sm:text-xl">
              {formatCurrency(data.balance)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No ledger entries"
          description="Money collections and expenses will appear here"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-baseline gap-x-2">
              <span>
                {selectedName ? `${selectedName} · Transaction History` : "Transaction History"}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Showing {visibleEntries.length} of {allEntries.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visibleEntries.map((entry, index) => {
                const amount = typeof entry.amount === "number" ? entry.amount : parseFloat(entry.amount);
                const isPositive = amount >= 0;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      {isPositive ? (
                        <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                      ) : (
                        <ArrowDownCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      )}
                      <LedgerEntryDetails entry={entry} />
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                      <p
                        className={`font-bold ${isPositive ? "text-success" : "text-destructive"}`}
                      >
                        {isPositive ? "+" : ""}
                        {formatCurrency(amount)}
                      </p>
                      <Badge variant={ledgerBadgeVariant(entry.type)}>{entry.type}</Badge>
                    </div>
                  </motion.div>
                );
              })}

              {visibleEntries.length < allEntries.length && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, allEntries.length - visibleEntries.length)} more
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
