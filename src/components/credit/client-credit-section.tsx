"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, ArrowUpRight, ArrowDownRight, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { toOwnerLabel } from "@/lib/brand";
import {
  ClientCreditModal,
  ClientCreditHistoryEntry,
  ClientCreditSale,
} from "@/components/credit/client-credit-modal";

export interface ClientCreditSectionData {
  clientBalances: { clientId: string; clientName: string; amount: number }[];
  creditSales: ClientCreditSale[];
  creditHistory: ClientCreditHistoryEntry[];
}

type CategoryFilter = "ALL" | "OWNER" | "CLIENT";
type TypeFilter =
  | "ALL"
  | "COLLECTION"
  | "EXPENSE"
  | "ADJUSTMENT"
  | "HANDOVER"
  | "CREDIT_SALE"
  | "PAYMENT";

interface ClientCreditSectionProps {
  data: ClientCreditSectionData;
  includeOwnerHistory?: boolean;
  onPaymentSuccess: () => void;
}

function historyTypeLabel(type: string) {
  switch (type) {
    case "COLLECTION":
      return "Collection";
    case "EXPENSE":
      return "Expense";
    case "ADJUSTMENT":
      return "Adjustment";
    case "HANDOVER":
      return "Handover";
    case "CREDIT_SALE":
      return "Credit Sale";
    case "PAYMENT":
      return "Payment";
    default:
      return type.replace(/_/g, " ");
  }
}

function historyTypeBadgeVariant(
  type: string
): "success" | "warning" | "danger" | "info" | "primary" | "default" {
  switch (type) {
    case "CREDIT_SALE":
      return "warning";
    case "PAYMENT":
      return "info";
    case "COLLECTION":
      return "success";
    case "EXPENSE":
      return "danger";
    case "ADJUSTMENT":
      return "primary";
    case "HANDOVER":
      return "info";
    default:
      return "default";
  }
}

function historyEntryStyles(entry: ClientCreditHistoryEntry) {
  if (entry.category === "CLIENT") {
    if (entry.type === "PAYMENT") {
      return {
        row: "border border-[#ccdbe8] bg-[#eef4fa] border-l-4 border-l-[#6a9bb8]",
        amount: "text-[#2d4a62]",
        icon: "text-[#6a9bb8]",
      };
    }

    return {
      row: "border border-[#c8dcc8] bg-[#eef6ee] border-l-4 border-l-success",
      amount: "text-success",
      icon: "text-success",
    };
  }

  switch (entry.type) {
    case "EXPENSE":
      return {
        row: "border border-[#e8d0d0] bg-[#faf0f0] border-l-4 border-l-destructive",
        amount: "text-destructive",
        icon: "text-destructive",
      };
    case "COLLECTION":
      return {
        row: "border border-[#c8dcc8] bg-[#eef6ee] border-l-4 border-l-success",
        amount: "text-success",
        icon: "text-success",
      };
    case "HANDOVER":
      return {
        row: "border border-[#ccdbe8] bg-[#eef4fa] border-l-4 border-l-[#6a9bb8]",
        amount: "text-[#2d4a62]",
        icon: "text-[#6a9bb8]",
      };
    case "ADJUSTMENT":
      return entry.amount >= 0
        ? {
            row: "border border-[#ddd0b8] bg-[#faf6ee] border-l-4 border-l-warning",
            amount: "text-warning",
            icon: "text-warning",
          }
        : {
            row: "border border-[#ccdbe8] bg-[#eef4fa] border-l-4 border-l-[#6a9bb8]",
            amount: "text-[#2d4a62]",
            icon: "text-[#6a9bb8]",
          };
    default:
      return {
        row: "border border-border bg-muted/50 border-l-4 border-l-border",
        amount: entry.amount >= 0 ? "text-warning" : "text-destructive",
        icon: entry.amount >= 0 ? "text-warning" : "text-destructive",
      };
  }
}

function categoryFilterStyles(key: CategoryFilter, active: boolean) {
  if (!active) {
    return "border border-border bg-surface hover:border-primary/30 hover:bg-secondary";
  }

  switch (key) {
    case "OWNER":
      return "bg-[#ddd0b8] text-[#5c4a28] shadow-md shadow-[#ddd0b8]/40";
    case "CLIENT":
      return "bg-secondary text-secondary-foreground shadow-md shadow-secondary/30";
    default:
      return "bg-primary text-white shadow-md shadow-primary/25";
  }
}

export function ClientCreditSection({
  data,
  includeOwnerHistory = false,
  onPaymentSuccess,
}: ClientCreditSectionProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [selectedClient, setSelectedClient] = useState<{
    clientId: string;
    clientName: string;
    amount: number;
  } | null>(null);

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return data.clientBalances;
    return data.clientBalances.filter((client) => client.clientName.toLowerCase().includes(query));
  }, [data.clientBalances, clientSearch]);

  const clientsWithCredit = useMemo(
    () => filteredClients.filter((client) => client.amount > 0),
    [filteredClients]
  );

  const clientsPaidUp = useMemo(
    () => filteredClients.filter((client) => client.amount === 0),
    [filteredClients]
  );

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    return data.creditHistory.filter((entry) => {
      if (!includeOwnerHistory && entry.category !== "CLIENT") return false;
      if (includeOwnerHistory && categoryFilter !== "ALL" && entry.category !== categoryFilter) {
        return false;
      }
      if (typeFilter !== "ALL" && entry.type !== typeFilter) return false;
      if (!query) return true;

      const haystack = [
        entry.description,
        entry.reference,
        entry.clientName,
        entry.productNames,
        historyTypeLabel(entry.type),
        entry.category === "OWNER" ? "owner" : "client",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [data.creditHistory, historySearch, categoryFilter, typeFilter, includeOwnerHistory]);

  const hasActiveHistoryFilters =
    historySearch.trim() !== "" ||
    (includeOwnerHistory && categoryFilter !== "ALL") ||
    typeFilter !== "ALL";

  function renderClientRow(
    client: { clientId: string; clientName: string; amount: number },
    paidUp = false
  ) {
    return (
      <button
        key={client.clientId}
        type="button"
        onClick={() => setSelectedClient(client)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors border-l-4",
          paidUp
            ? "border-border bg-muted/30 border-l-border hover:bg-muted/50"
            : "border-[#c8dcc8] bg-[#eef6ee] border-l-success hover:bg-[#e4f0e4]"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Users className={cn("h-4 w-4 shrink-0", paidUp ? "text-muted-foreground" : "text-success")} />
          <span
            className={cn(
              "font-medium truncate underline-offset-2 hover:underline",
              paidUp ? "text-foreground" : "text-primary"
            )}
          >
            {client.clientName}
          </span>
        </div>
        <span
          className={cn(
            "font-bold shrink-0 ml-2",
            paidUp ? "text-muted-foreground text-sm" : "text-success"
          )}
        >
          {paidUp ? "Paid up" : formatCurrency(client.amount)}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card hover>
            <CardHeader>
              <CardTitle className="text-base">Client Credit Balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search clients by name..."
                  className="pl-9"
                />
              </div>

              {data.clientBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No clients with credit history yet
                </p>
              ) : filteredClients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No clients match your search</p>
              ) : (
                <div className="space-y-4 max-h-80 overflow-y-auto">
                  {clientsWithCredit.length > 0 && (
                    <div className="space-y-3">
                      {clientsWithCredit.map((client) => renderClientRow(client))}
                    </div>
                  )}

                  {clientsPaidUp.length > 0 && (
                    <div className="space-y-3">
                      {clientsWithCredit.length > 0 && (
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">
                          Paid up
                        </p>
                      )}
                      {clientsPaidUp.map((client) => renderClientRow(client, true))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card hover>
            <CardHeader>
              <CardTitle className="text-base">Unpaid Credit Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {data.creditSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No unpaid sales</p>
              ) : (
                <div className="divide-y divide-border max-h-64 overflow-y-auto rounded-lg border border-border">
                  {data.creditSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{sale.clientName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {sale.productNames} · {formatDateTime(sale.saleDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={sale.paymentStatus === "PARTIAL" ? "warning" : "danger"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {sale.paymentStatus === "PARTIAL" ? "Partial" : "Credit"}
                        </Badge>
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            sale.paymentStatus === "PARTIAL" ? "text-warning" : "text-destructive"
                          )}
                        >
                          {formatCurrency(sale.outstanding)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card hover>
          <CardHeader>
            <CardTitle className="text-base">Credit History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search product, client, description, sale #..."
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {includeOwnerHistory && (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "ALL", label: "All" },
                        { key: "OWNER", label: toOwnerLabel() },
                        { key: "CLIENT", label: "From Client" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setCategoryFilter(option.key)}
                        className={cn(
                          "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                          categoryFilterStyles(option.key, categoryFilter === option.key)
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground shrink-0">Type:</Label>
                  <Select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                    className="w-auto min-w-[160px]"
                  >
                    <option value="ALL">All types</option>
                    <option value="CREDIT_SALE">Credit sales</option>
                    <option value="PAYMENT">Payments</option>
                    {includeOwnerHistory && (
                      <>
                        <option value="COLLECTION">Collections</option>
                        <option value="EXPENSE">Expenses</option>
                        <option value="ADJUSTMENT">Adjustments</option>
                        <option value="HANDOVER">Handovers</option>
                      </>
                    )}
                  </Select>
                </div>

                {hasActiveHistoryFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch("");
                      setCategoryFilter("ALL");
                      setTypeFilter("ALL");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}

                <span className="ml-auto text-xs text-muted-foreground">
                  Showing {filteredHistory.length} of {data.creditHistory.length}
                </span>
              </div>
            </div>

            {data.creditHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No credit history yet</p>
            ) : filteredHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No matching credit history</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredHistory.map((entry) => {
                  const styles = historyEntryStyles(entry);
                  const Icon = entry.amount >= 0 ? ArrowUpRight : ArrowDownRight;

                  return (
                    <div
                      key={`${entry.category}-${entry.id}`}
                      className={cn("flex items-center justify-between rounded-lg px-3 py-2.5", styles.row)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          {includeOwnerHistory && (
                            <Badge variant={entry.category === "OWNER" ? "warning" : "success"}>
                              {entry.category === "OWNER" ? toOwnerLabel() : "From Client"}
                            </Badge>
                          )}
                          <Badge variant={historyTypeBadgeVariant(entry.type)}>
                            {historyTypeLabel(entry.type)}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{entry.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.clientName && `${entry.clientName} · `}
                          {formatDateTime(entry.entryDate)}
                          {entry.category === "OWNER" && entry.reference && ` · ${entry.reference}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-3">
                        <Icon className={cn("h-4 w-4", styles.icon)} />
                        <span className={cn("font-semibold", styles.amount)}>
                          {formatCurrency(Math.abs(entry.amount))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <ClientCreditModal
        open={selectedClient !== null}
        onClose={() => setSelectedClient(null)}
        client={selectedClient}
        creditSales={data.creditSales}
        creditHistory={data.creditHistory}
        onPaymentSuccess={onPaymentSuccess}
      />
    </>
  );
}
