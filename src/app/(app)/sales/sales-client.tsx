"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Receipt,
  ArrowLeftRight,
  Search,
  Calendar,
  DollarSign,
  TrendingUp,
  Wallet,
  AlertCircle,
  TrendingDown,
  Pencil,
  Undo2,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { SaleForm } from "@/components/sales/sale-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { SaleType } from "@/components/sales/sale-form";
import { getSaleProfit } from "@/lib/sale-utils";
import { cn, formatCurrency, formatSaleDateTime, getSalePaymentMethods, isDateInLocalRange, parseStoredDate, startOfLocalDay, endOfLocalDay } from "@/lib/utils";
import {
  getTodayEthiopianInputValue,
} from "@/lib/ethiopian-calendar";
import { ensureSaleDateEthiopian } from "@/lib/sale-dates";
import { EthiopianDateInput } from "@/components/ui/ethiopian-date-input";
import { Role } from "@prisma/client";

interface SaleRecord {
  id: string;
  saleNumber: string;
  type: SaleType;
  totalAmount: number | string;
  paidAmount: number | string;
  paymentStatus: string;
  saleDate: string;
  saleDateEthiopian?: string;
  createdAt: string;
  client?: { name: string };
  soldBy?: { id: string; name: string };
  retailSoldBy?: { id: string; name: string };
  payments?: {
    paymentMethod?: string | null;
    amount?: string;
    bankAccount?: { name: string } | null;
  }[];
  items: {
    cartonsSold: number;
    itemsSold: number;
    unitPrice?: number | string;
    totalPrice?: number | string;
    carton: {
      itemsPerCarton: number;
      warehouseLeavingPrice?: number | string | null;
      product: { name: string; unitCost?: number | string };
    };
  }[];
}

type FilterType = "ALL" | SaleType;
type PaymentFilter = "ALL" | "PAID" | "PARTIAL" | "CREDIT";
type PeriodMode = "today" | "7d" | "30d" | "all" | "custom";

const typeConfig: Record<
  SaleType,
  { label: string; variant: "info" | "primary" | "success"; icon: React.ReactNode }
> = {
  WHOLESALE: { label: "Wholesale", variant: "info", icon: <ShoppingCart className="h-3 w-3" /> },
  SHOP_TRANSFER: { label: "Shop Transfer", variant: "primary", icon: <ArrowLeftRight className="h-3 w-3" /> },
  RETAIL: { label: "Retail", variant: "success", icon: <Receipt className="h-3 w-3" /> },
};

function parseAmount(value: number | string) {
  return typeof value === "number" ? value : parseFloat(value) || 0;
}

const PERIOD_OPTIONS: { key: PeriodMode; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

function getPeriodRange(mode: "7d" | "30d") {
  const today = startOfLocalDay(new Date());
  const end = endOfLocalDay(today);
  const days = mode === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

function getSaleEthiopianDate(sale: SaleRecord) {
  return ensureSaleDateEthiopian(parseStoredDate(sale.saleDate), sale.saleDateEthiopian);
}

function isInPeriod(sale: SaleRecord, mode: PeriodMode, customDate: string) {
  if (mode === "all") return true;

  if (mode === "today") {
    return getSaleEthiopianDate(sale) === getTodayEthiopianInputValue();
  }

  if (mode === "custom") {
    return getSaleEthiopianDate(sale) === customDate;
  }

  const { start, end } = getPeriodRange(mode);
  return isDateInLocalRange(sale.saleDate, start, end);
}

function sortSalesRecentFirst<T extends { createdAt: string; saleDate: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
  );
}

function formatItemQuantity(item: SaleRecord["items"][0]) {
  const { cartonsSold, itemsSold } = item;

  if (cartonsSold > 0 && itemsSold > 0) {
    return `${cartonsSold} carton${cartonsSold !== 1 ? "s" : ""} and ${itemsSold} piece${itemsSold !== 1 ? "s" : ""}`;
  }
  if (cartonsSold > 0) {
    return `${cartonsSold} carton${cartonsSold !== 1 ? "s" : ""}`;
  }
  if (itemsSold > 0) {
    return `${itemsSold} piece${itemsSold !== 1 ? "s" : ""}`;
  }
  return "No quantity recorded";
}

function getItemUnitPrice(item: SaleRecord["items"][0]) {
  return parseAmount(item.unitPrice ?? "0");
}

function profitLabel(profit: number) {
  if (profit > 0) return "Profit";
  if (profit < 0) return "Loss";
  return "Break even";
}

export function SalesClient({
  user,
}: {
  user: { id: string; name: string; role: Role; email: string; shopName?: string | null };
}) {
  const isShopStaff = user.role === Role.SALESPERSON;
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>(isShopStaff ? "RETAIL" : "ALL");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodMode>("today");
  const [customDate, setCustomDate] = useState(() => getTodayEthiopianInputValue());
  const [editingSale, setEditingSale] = useState<{ id: string; type: SaleType } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [salespersonFilter, setSalespersonFilter] = useState("ALL");
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);

  const [loadError, setLoadError] = useState("");

  const loadSales = useCallback(() => {
    setLoading(true);
    setLoadError("");
    fetch("/api/sales")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error(
            typeof data === "object" && data && "error" in data
              ? String(data.error)
              : "Failed to load sales"
          );
        }
        setSales(sortSalesRecentFirst(Array.isArray(data) ? data : []));
      })
      .catch((err) => {
        setSales([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load sales");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (isShopStaff) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { id: string; name: string; isActive?: boolean }[]) => {
        setStaffOptions(
          data
            .filter((user) => user.isActive !== false)
            .map((user) => ({ id: user.id, name: user.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => setStaffOptions([]));
  }, [isShopStaff]);

  function getSaleStaffId(sale: SaleRecord) {
    if (sale.type === "RETAIL") return sale.retailSoldBy?.id;
    return sale.soldBy?.id;
  }

  const periodSales = useMemo(
    () => sortSalesRecentFirst(sales.filter((s) => isInPeriod(s, period, customDate))),
    [sales, period, customDate]
  );

  const showStaffFilter =
    !isShopStaff && (filter === "ALL" || filter === "RETAIL" || filter === "SHOP_TRANSFER");

  const staffFilterOptions = useMemo(() => {
    const idsInView = new Set<string>();
    for (const sale of periodSales) {
      if (filter !== "ALL" && sale.type !== filter) continue;
      if (sale.type !== "RETAIL" && sale.type !== "SHOP_TRANSFER" && filter === "ALL") continue;
      if (filter === "ALL" && sale.type === "WHOLESALE") continue;
      const staffId = getSaleStaffId(sale);
      if (staffId) idsInView.add(staffId);
    }
    return staffOptions.filter((staff) => idsInView.has(staff.id));
  }, [periodSales, filter, staffOptions]);

  const salesWithProfit = useMemo(
    () =>
      periodSales.map((sale) => ({
        ...sale,
        profit: isShopStaff
          ? 0
          : getSaleProfit(
              sale.totalAmount,
              sale.items as Parameters<typeof getSaleProfit>[1],
              sale.type
            ),
      })),
    [periodSales, isShopStaff]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortSalesRecentFirst(
      salesWithProfit.filter((s) => {
        if (filter !== "ALL" && s.type !== filter) return false;
        if (paymentFilter !== "ALL" && s.paymentStatus !== paymentFilter) return false;
        if (salespersonFilter !== "ALL") {
          if (s.type === "RETAIL" || s.type === "SHOP_TRANSFER") {
            if (getSaleStaffId(s) !== salespersonFilter) return false;
          } else if (filter === "RETAIL" || filter === "SHOP_TRANSFER") {
            return false;
          }
        }
        if (!q) return true;

        const haystack = [
          s.saleNumber,
          s.client?.name,
          s.soldBy?.name,
          s.retailSoldBy?.name,
          ...s.items.map((i) => i.carton.product.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      })
    );
  }, [salesWithProfit, filter, paymentFilter, search, salespersonFilter]);

  const report = useMemo(() => {
    const revenueSales = periodSales.filter((s) => s.type !== "SHOP_TRANSFER");
    const totalRevenue = periodSales.reduce((sum, s) => sum + parseAmount(s.totalAmount), 0);
    const collected = revenueSales.reduce((sum, s) => sum + parseAmount(s.paidAmount), 0);
    const outstanding = revenueSales.reduce(
      (sum, s) => sum + Math.max(0, parseAmount(s.totalAmount) - parseAmount(s.paidAmount)),
      0
    );
    const totalProfit = salesWithProfit
      .filter((s) => s.type === "RETAIL" || s.type === "WHOLESALE")
      .reduce((sum, s) => sum + s.profit, 0);

    return {
      totalSales: periodSales.length,
      totalRevenue,
      collected,
      outstanding,
      totalProfit,
      wholesale: periodSales.filter((s) => s.type === "WHOLESALE").length,
      retail: periodSales.filter((s) => s.type === "RETAIL").length,
      transfers: periodSales.filter((s) => s.type === "SHOP_TRANSFER").length,
    };
  }, [periodSales, salesWithProfit]);

  const filteredProfitTotal = useMemo(
    () => filtered.reduce((sum, s) => sum + s.profit, 0),
    [filtered]
  );

  const typeCounts = useMemo(
    () => ({
      all: periodSales.length,
      WHOLESALE: periodSales.filter((s) => s.type === "WHOLESALE").length,
      SHOP_TRANSFER: periodSales.filter((s) => s.type === "SHOP_TRANSFER").length,
      RETAIL: periodSales.filter((s) => s.type === "RETAIL").length,
    }),
    [periodSales]
  );

  const statusVariant = (status: string) => {
    if (status === "PAID") return "success";
    if (status === "PARTIAL") return "warning";
    return "danger";
  };

  const canModifySale = (sale: SaleRecord) =>
    sale.type === "RETAIL" ||
    (!isShopStaff && (sale.type === "WHOLESALE" || sale.type === "SHOP_TRANSFER"));

  async function handleReverseSale(sale: SaleRecord) {
    const label = sale.items.map((i) => i.carton.product.name).join(", ");
    const isTransfer = sale.type === "SHOP_TRANSFER";
    if (
      !confirm(
        isTransfer
          ? `Reverse this shop transfer?\n\n${label}\n\nStock will be moved back to the warehouse and the transfer will be removed.`
          : `Reverse this sale?\n\n${label}\n\nStock will be restored and the sale will be removed.`
      )
    ) {
      return;
    }

    setActionLoadingId(sale.id);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reverse sale");
      loadSales();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reverse sale");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <DashboardLayout
      user={user}
      title="Sales"
      description={isShopStaff ? "Your shop retail sales log" : "Sales log, filters, and period reports"}
    >
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />
              Report Period
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    period === option.key
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-border bg-card hover:bg-secondary"
                  )}
                >
                  {option.label}
                </button>
              ))}
              <EthiopianDateInput
                value={customDate}
                onChange={(value) => {
                  setCustomDate(value);
                  setPeriod("custom");
                }}
                label=""
                hideSummary
                className={cn(period === "custom" && "rounded-lg ring-2 ring-primary/30 p-2")}
              />
            </div>
          </div>

          <div className="relative min-w-[240px] flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isShopStaff ? "Search client, product..." : "Search sale #, client, product..."}
              className="pl-9"
            />
          </div>
        </div>

        <div
          className={cn(
            "grid gap-3 grid-cols-2 sm:grid-cols-3",
            isShopStaff ? "lg:grid-cols-4" : "lg:grid-cols-5"
          )}
        >
          <StatCard
            compact
            title="Sales"
            value={String(report.totalSales)}
            icon={<TrendingUp className="h-4 w-4" />}
            delay={0}
          />
          <StatCard
            compact
            title="Total Revenue"
            value={formatCurrency(report.totalRevenue)}
            icon={<DollarSign className="h-4 w-4" />}
            delay={0.05}
          />
          {!isShopStaff && (
            <StatCard
              compact
              sensitive
              title={profitLabel(report.totalProfit)}
              value={formatCurrency(Math.abs(report.totalProfit))}
              icon={report.totalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              delay={0.08}
              valueClassName={report.totalProfit >= 0 ? "text-success" : "text-destructive"}
            />
          )}
          <StatCard
            compact
            title="Collected"
            value={formatCurrency(report.collected)}
            icon={<Wallet className="h-4 w-4" />}
            delay={0.1}
            valueClassName="text-success"
          />
          <StatCard
            compact
            title="Outstanding"
            value={formatCurrency(report.outstanding)}
            icon={<AlertCircle className="h-4 w-4" />}
            delay={0.15}
            valueClassName={report.outstanding > 0 ? "text-warning" : undefined}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {!isShopStaff && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "ALL", label: `All (${typeCounts.all})` },
                  { key: "WHOLESALE", label: `Wholesale (${typeCounts.WHOLESALE})` },
                  { key: "SHOP_TRANSFER", label: `Transfers (${typeCounts.SHOP_TRANSFER})` },
                  { key: "RETAIL", label: `Retail (${typeCounts.RETAIL})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                    filter === f.key
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "border border-border bg-surface hover:border-primary/30 hover:bg-secondary"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {showStaffFilter && staffFilterOptions.length > 0 && (
              <>
                <Label className="text-sm text-muted-foreground shrink-0">Staff:</Label>
                <Select
                  value={salespersonFilter}
                  onChange={(e) => setSalespersonFilter(e.target.value)}
                  className="w-auto min-w-[160px]"
                >
                  <option value="ALL">All staff</option>
                  {staffFilterOptions.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            <Label className="text-sm text-muted-foreground shrink-0">Payment:</Label>
            <Select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
              className="w-auto min-w-[140px]"
            >
              <option value="ALL">All statuses</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="CREDIT">Credit</option>
            </Select>
            {(search || filter !== "ALL" || paymentFilter !== "ALL" || salespersonFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("ALL");
                  setPaymentFilter("ALL");
                  setSalespersonFilter("ALL");
                }}
                className="text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {filtered.length} of {periodSales.length}
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title={periodSales.length === 0 ? "No sales in this period" : "No matching sales"}
          description={
            periodSales.length === 0
              ? "Try another date range or record sales from Inventory"
              : "Adjust your search or filters to see more results"
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((sale, index) => {
            const config = typeConfig[sale.type];
            const paymentMethods = getSalePaymentMethods(sale.payments);
            const paidTotal = parseAmount(sale.paidAmount);
            const showModifyActions = canModifySale(sale);
            const isActionLoading = actionLoadingId === sale.id;

            return (
              <motion.div
                key={sale.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card hover>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-[1fr_auto] grid-rows-[auto_1fr] gap-x-4 gap-y-2">
                      <div className="col-start-1 row-start-1 row-span-2 min-w-0">
                        <div className="space-y-2">
                          {sale.items.map((item, itemIndex) => (
                            <div key={itemIndex}>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold truncate">{item.carton.product.name}</p>
                                {!isShopStaff && itemIndex === 0 && (
                                  <Badge variant={config.variant}>
                                    <span className="flex items-center gap-1">
                                      {config.icon}
                                      {config.label}
                                    </span>
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatItemQuantity(item)}
                                <span className="text-foreground/80">
                                  {" "}
                                  · {formatCurrency(getItemUnitPrice(item))} per piece
                                </span>
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {sale.client?.name || (sale.type === "SHOP_TRANSFER" ? "Internal transfer" : "No client")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatSaleDateTime(sale.saleDateEthiopian, sale.createdAt, sale.saleDate)}
                        </p>
                        {!isShopStaff && (sale.soldBy || sale.retailSoldBy) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            By {sale.retailSoldBy?.name || sale.soldBy?.name}
                          </p>
                        )}
                        {!isShopStaff && (sale.type === "RETAIL" || sale.type === "WHOLESALE") && (
                          <p
                            className={cn(
                              "text-sm font-semibold mt-1",
                              sale.profit > 0 && "text-success",
                              sale.profit < 0 && "text-destructive",
                              sale.profit === 0 && "text-muted-foreground"
                            )}
                          >
                            {profitLabel(sale.profit)}: {sale.profit >= 0 ? "+" : "−"}
                            {formatCurrency(Math.abs(sale.profit))}
                          </p>
                        )}
                      </div>

                      {showModifyActions && (
                        <div className="col-start-2 row-start-1 flex gap-1 justify-self-end self-start">
                          {(sale.type === "RETAIL" || sale.type === "SHOP_TRANSFER") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() => setEditingSale({ id: sale.id, type: sale.type })}
                              aria-label={sale.type === "SHOP_TRANSFER" ? "Edit transfer" : "Edit sale"}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => handleReverseSale(sale)}
                            aria-label="Reverse sale"
                            className="text-destructive hover:text-destructive"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      <div
                        className={cn(
                          "col-start-2 text-right space-y-1 self-end justify-self-end",
                          showModifyActions ? "row-start-2" : "row-start-1 row-span-2"
                        )}
                      >
                        <p className="text-lg font-bold">{formatCurrency(sale.totalAmount)}</p>
                        {sale.type === "SHOP_TRANSFER" ? (
                          <p className="text-xs text-muted-foreground">Transfer value</p>
                        ) : (
                          <>
                            <Badge variant={statusVariant(sale.paymentStatus)}>{sale.paymentStatus}</Badge>
                            {paidTotal > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Paid: {formatCurrency(paidTotal)}
                                {paymentMethods && (
                                  <span className="text-foreground/80"> · {paymentMethods}</span>
                                )}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Nothing paid yet</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
            <span className="text-sm font-medium text-muted-foreground">
              Total for {filtered.length} sale{filtered.length !== 1 ? "s" : ""} shown
            </span>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                Revenue: {formatCurrency(filtered.reduce((sum, s) => sum + parseAmount(s.totalAmount), 0))}
              </p>
              {!isShopStaff && (
                <p
                  className={cn(
                    "text-lg font-bold",
                    filteredProfitTotal >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  Net {profitLabel(filteredProfitTotal)}: {filteredProfitTotal >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(filteredProfitTotal))}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {editingSale && (
        <SaleForm
          user={user}
          type={editingSale.type}
          mode="modal"
          saleId={editingSale.id}
          onSuccess={() => {
            setEditingSale(null);
            loadSales();
          }}
          onCancel={() => setEditingSale(null)}
        />
      )}
    </DashboardLayout>
  );
}
