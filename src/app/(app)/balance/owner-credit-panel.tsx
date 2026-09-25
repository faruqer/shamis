"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Search, Send, Wallet } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { HandoverModal } from "@/components/credit/handover-modal";
import {
  LedgerEntryDetails,
  ledgerBadgeVariant,
  type LedgerEntry,
} from "@/components/ledger/ledger-entry-details";
import { formatCurrency } from "@/lib/utils";
import { creditToOwnerLabel, handoverToOwnerLabel, OWNER_NAME } from "@/lib/brand";

interface OwnerCreditData {
  shopName?: string | null;
  ownerCredit: number;
  ownerEntries: LedgerEntry[];
}

const PAGE_SIZE = 75;

const TYPE_FILTERS = [
  { key: "ALL", label: "All types" },
  { key: "COLLECTION", label: "Collections" },
  { key: "EXPENSE", label: "Expenses" },
  { key: "HANDOVER", label: "Handovers" },
  { key: "ADJUSTMENT", label: "Adjustments" },
] as const;

/**
 * A salesperson's own credit to the owner: what they hold, the handover action,
 * and the ledger behind it. This used to sit on the Credit page mixed in with
 * client credit; it is now the first tab of Balance, beside Expenses, Bank
 * Accounts and hw.
 */
export function OwnerCreditPanel() {
  const [data, setData] = useState<OwnerCreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHandover, setShowHandover] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  // A busy shop builds hundreds of rows; render them in pages so a phone is not
  // asked to lay out the whole ledger at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadData = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetch("/api/balance")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load balance");
        }
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load balance"))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const entries = useMemo(() => data?.ownerEntries ?? [], [data]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (typeFilter !== "ALL" && entry.type !== typeFilter) return false;
      if (!query) return true;

      const haystack = [
        entry.description,
        entry.sale?.saleNumber,
        entry.sale?.clientName,
        entry.sale?.shopName,
        entry.expense?.description,
        entry.payment?.bankName,
        ...(entry.sale?.items.map((item) => item.productName) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [entries, search, typeFilter]);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "ALL";
  const visibleEntries = filteredEntries.slice(0, visibleCount);

  // Narrowing the filters should start the list from the top again.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, typeFilter]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  if (!data) return null;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{creditToOwnerLabel()}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.shopName
              ? `${data.shopName} · money you hold for ${OWNER_NAME}`
              : `Money you hold for ${OWNER_NAME}`}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          compact
          title={creditToOwnerLabel()}
          value={formatCurrency(data.ownerCredit)}
          icon={<Wallet className="h-4 w-4" />}
          delay={0}
          valueClassName={data.ownerCredit > 0 ? "text-warning" : undefined}
        />
      </div>

      {data.ownerCredit > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card hover className="border-[#ddd0b8] border-l-4 border-l-warning bg-[#faf6ee]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{handoverToOwnerLabel()}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You owe {OWNER_NAME} {formatCurrency(data.ownerCredit)} from collections and shop
                  stock. Record here after you send the money.
                </p>
              </div>
              <Button onClick={() => setShowHandover(true)} className="w-full shrink-0 sm:w-auto">
                <Send className="h-4 w-4" />
                {handoverToOwnerLabel()}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No entries yet"
          description={`Collections, expenses and handovers to ${OWNER_NAME} will appear here`}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, client, sale #, description..."
                  className="pl-9"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 text-sm text-muted-foreground">Type:</Label>
                  <Select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full sm:w-auto sm:min-w-[160px]"
                  >
                    {TYPE_FILTERS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setTypeFilter("ALL");
                    }}
                    className="self-start text-xs text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}

                <span className="text-xs text-muted-foreground sm:ml-auto">
                  Showing {visibleEntries.length} of {filteredEntries.length}
                  {filteredEntries.length !== entries.length && ` (${entries.length} total)`}
                </span>
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching entries</p>
            ) : (
              <div className="space-y-2">
                {visibleEntries.map((entry, index) => {
                  const amount =
                    typeof entry.amount === "number" ? entry.amount : parseFloat(entry.amount);
                  const isPositive = amount >= 0;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(index, 20) * 0.02 }}
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

                {visibleEntries.length < filteredEntries.length && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  >
                    Show {Math.min(PAGE_SIZE, filteredEntries.length - visibleEntries.length)} more
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <HandoverModal
        open={showHandover}
        onClose={() => setShowHandover(false)}
        owedToOwner={data.ownerCredit}
        onSuccess={() => loadData(true)}
      />
    </section>
  );
}
