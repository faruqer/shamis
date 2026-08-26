"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ProfitEyeToggle, PROFIT_MASK, useProfitReveal } from "@/components/ui/profit-reveal";
import { LoadingSpinner } from "@/components/layout/page-transition";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  creditHeldForOwnerLabel,
  creditToOwnerLabel,
  creditToOwnerTrendLabel,
} from "@/lib/brand";
import { Role } from "@prisma/client";

type PeriodMode = "7d" | "30d" | "90d" | "day" | "range";
type Channel = "all" | "wholesale" | "retail";
type SaleTypeFilter = "all" | "WHOLESALE" | "RETAIL" | "SHOP_TRANSFER";
type PaymentStatusFilter = "all" | "PAID" | "PARTIAL" | "CREDIT";

type FilterOption = { id: string; name: string };

interface ReportData {
  scoped: "admin" | "salesperson";
  shopName?: string | null;
  period: string;
  channel?: string;
  summary: Record<string, number>;
  trends: {
    labels: string[];
    revenue: number[];
    profit: number[];
    salesCount: number[];
    expenses?: number[];
    ownerCreditDaily: number[];
    ownerCreditCumulative: number[];
  };
  paymentBreakdown: { label: string; value: number; color: string }[];
  saleTypeBreakdown?: { label: string; value: number; color: string }[];
  topProducts?: { name: string; revenue: number; profit: number; itemsSold: number }[];
  expenseBreakdown?: { label: string; value: number }[];
  salesByShop?: { name: string; revenue: number; count: number }[];
  bankBalances?: { id: string; name: string; isActive: boolean; balance: number; paymentCount: number }[];
  recentSales?: {
    id: string;
    saleNumber: string;
    type: string;
    date: string;
    client: string | null;
    shop: string | null;
    salesperson: string | null;
    total: number;
    paid: number;
    status: string;
  }[];
  recentExpenses?: {
    id: string;
    description: string;
    date: string;
    amount: number;
    bank: string | null;
  }[];
  recentTransfers?: {
    id: string;
    date: string;
    fromBank: string;
    toBank: string;
    amount: number;
    notes: string | null;
  }[];
}

const PERIOD_OPTIONS: { key: PeriodMode; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "day", label: "Specific date" },
  { key: "range", label: "Custom range" },
];

const CHANNEL_OPTIONS: { key: Channel; label: string }[] = [
  { key: "all", label: "All channels" },
  { key: "wholesale", label: "Wholesale" },
  { key: "retail", label: "Retail" },
];

const SALE_TYPE_OPTIONS: { key: SaleTypeFilter; label: string }[] = [
  { key: "all", label: "All sale types" },
  { key: "WHOLESALE", label: "Wholesale" },
  { key: "RETAIL", label: "Retail" },
  { key: "SHOP_TRANSFER", label: "Shop transfer" },
];

const PAYMENT_STATUS_OPTIONS: { key: PaymentStatusFilter; label: string }[] = [
  { key: "all", label: "All payment statuses" },
  { key: "PAID", label: "Paid" },
  { key: "PARTIAL", label: "Partial" },
  { key: "CREDIT", label: "Credit" },
];

const REVENUE_COLOR = "#3b82c4";
const PROFIT_COLOR = "#16a34a";

function MetricCell({
  label,
  value,
  sub,
  valueClassName,
  sensitive = false,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
  sensitive?: boolean;
}) {
  const { visible, toggle } = useProfitReveal(false);

  return (
    <div className="rounded-md border border-border/70 bg-card px-2.5 py-1.5 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate flex-1">
          {label}
        </p>
        {sensitive ? <ProfitEyeToggle visible={visible} onToggle={toggle} /> : null}
      </div>
      <p className={`text-sm font-semibold tabular-nums truncate ${valueClassName ?? ""}`}>
        {sensitive && !visible ? PROFIT_MASK : value}
      </p>
      {sub ? <p className="text-[10px] text-muted-foreground truncate">{sub}</p> : null}
    </div>
  );
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ReportClient({
  user,
}: {
  user: { name: string; role: Role; email: string; shopName?: string | null };
}) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("30d");
  const [specificDate, setSpecificDate] = useState(todayIso);
  const [rangeFrom, setRangeFrom] = useState(daysAgoIso(29));
  const [rangeTo, setRangeTo] = useState(todayIso);
  const [channel, setChannel] = useState<Channel>("all");
  const [saleType, setSaleType] = useState<SaleTypeFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("all");
  const [shopId, setShopId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [filterOptions, setFilterOptions] = useState<{
    shops: FilterOption[];
    salespersons: FilterOption[];
    banks: FilterOption[];
  }>({ shops: [], salespersons: [], banks: [] });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("channel", channel);
    if (saleType !== "all") params.set("saleType", saleType);
    if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
    if (shopId) params.set("shopId", shopId);
    if (salespersonId) params.set("salespersonId", salespersonId);
    if (bankAccountId) params.set("bankAccountId", bankAccountId);

    if (periodMode === "day") {
      params.set("date", specificDate);
    } else if (periodMode === "range") {
      params.set("from", rangeFrom);
      params.set("to", rangeTo);
    } else {
      params.set("period", periodMode);
    }

    fetch(`/api/reports?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load report (${res.status})`);
        }
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => {
        setData(null);
        setError(err.message || "Failed to load report");
      })
      .finally(() => setLoading(false));
  }, [
    periodMode,
    specificDate,
    rangeFrom,
    rangeTo,
    channel,
    saleType,
    paymentStatus,
    shopId,
    salespersonId,
    bankAccountId,
  ]);

  useEffect(() => {
    if (user.role !== Role.ADMIN) return;
    Promise.all([
      fetch("/api/shops").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/salespersons").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/banks").then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([shops, salespersons, banks]) => {
        setFilterOptions({
          shops: (shops as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })),
          salespersons: (salespersons as { id: string; name: string }[]).map((s) => ({
            id: s.id,
            name: s.name,
          })),
          banks: (banks as { id: string; name: string }[]).map((b) => ({ id: b.id, name: b.name })),
        });
      })
      .catch(() => {});
  }, [user.role]);

  const clearFilters = () => {
    setChannel("all");
    setSaleType("all");
    setPaymentStatus("all");
    setShopId("");
    setSalespersonId("");
    setBankAccountId("");
    setTableSearch("");
  };

  const hasActiveFilters =
    channel !== "all" ||
    saleType !== "all" ||
    paymentStatus !== "all" ||
    !!shopId ||
    !!salespersonId ||
    !!bankAccountId;

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const isAdmin = data?.scoped === "admin";
  const trend = data?.summary.revenueTrend ?? 0;
  const trendPositive = trend >= 0;
  const channelLabel =
    channel === "wholesale" ? "Wholesale" : channel === "retail" ? "Retail" : "";

  return (
    <DashboardLayout
      user={user}
      title="Report"
      description={
        isAdmin
          ? "Detailed business performance, trends, and financial breakdown"
          : data?.shopName
            ? `${data.shopName} · retail performance and credit trends`
            : "Shop performance and trends"
      }
    >
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Period</Label>
            <Select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
              className="w-40 h-9 text-sm"
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>

          {periodMode === "day" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="w-40 h-9 text-sm"
              />
            </div>
          )}

          {periodMode === "range" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
              </div>
            </>
          )}

          {user.role === Role.ADMIN && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Channel</Label>
                <Select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className="w-40 h-9 text-sm"
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sale type</Label>
                <Select
                  value={saleType}
                  onChange={(e) => setSaleType(e.target.value as SaleTypeFilter)}
                  className="w-40 h-9 text-sm"
                >
                  {SALE_TYPE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Payment</Label>
                <Select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatusFilter)}
                  className="w-40 h-9 text-sm"
                >
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Shop</Label>
                <Select
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  className="w-40 h-9 text-sm"
                >
                  <option value="">All shops</option>
                  {filterOptions.shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Salesperson</Label>
                <Select
                  value={salespersonId}
                  onChange={(e) => setSalespersonId(e.target.value)}
                  className="w-40 h-9 text-sm"
                >
                  <option value="">All salespersons</option>
                  {filterOptions.salespersons.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Expense bank</Label>
                <Select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-40 h-9 text-sm"
                >
                  <option value="">All banks</option>
                  {filterOptions.banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {hasActiveFilters && (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}

          {data && (
            <div className="ml-auto flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs">
              {trendPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-success" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              )}
              <span className="text-muted-foreground">Revenue vs prev:</span>
              <span
                className={
                  trendPositive ? "text-success font-semibold" : "text-destructive font-semibold"
                }
              >
                {trendPositive ? "+" : ""}
                {trend}%
              </span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <button
            type="button"
            onClick={loadReport}
            className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 mb-4">
            {isAdmin ? (
              <>
                <MetricCell
                  label={channelLabel ? `${channelLabel} revenue` : "Revenue"}
                  value={formatCurrency(data.summary.totalRevenue ?? 0)}
                  valueClassName="text-[#3b82c4]"
                />
                <MetricCell
                  label={channelLabel ? `${channelLabel} profit` : "Profit"}
                  value={formatCurrency(data.summary.totalProfit ?? 0)}
                  valueClassName="text-[#16a34a]"
                  sensitive
                />
                <MetricCell
                  label="Net profit"
                  value={formatCurrency(data.summary.netProfit ?? 0)}
                  sub={`Exp ${formatCurrency(data.summary.totalExpenses ?? 0)}`}
                  valueClassName={
                    (data.summary.netProfit ?? 0) >= 0 ? "text-success" : "text-destructive"
                  }
                  sensitive
                />
                <MetricCell
                  label={creditHeldForOwnerLabel()}
                  value={formatCurrency(data.summary.ownerCreditTotal ?? 0)}
                  valueClassName="text-warning"
                />
                <MetricCell
                  label="Collected"
                  value={formatCurrency(data.summary.totalCollected ?? 0)}
                  valueClassName="text-success"
                />
                <MetricCell
                  label="Outstanding"
                  value={formatCurrency(data.summary.totalOutstanding ?? 0)}
                  valueClassName={
                    (data.summary.totalOutstanding ?? 0) > 0 ? "text-warning" : undefined
                  }
                />
                <MetricCell
                  label="In banks"
                  value={formatCurrency(data.summary.totalBankBalance ?? 0)}
                  sub={`${data.summary.expenseCount ?? 0} expenses`}
                  valueClassName="text-primary"
                />
                <MetricCell
                  label="Avg sale"
                  value={formatCurrency(data.summary.avgSale ?? 0)}
                  sub={`Margin ${data.summary.profitMargin ?? 0}%`}
                />
                {channel === "all" && (
                  <>
                    <MetricCell
                      label="Wholesale"
                      value={formatCurrency(data.summary.wholesaleRevenue ?? 0)}
                      sub={`${data.summary.wholesaleCount ?? 0} sales`}
                    />
                    <MetricCell
                      label="Retail"
                      value={formatCurrency(data.summary.retailRevenue ?? 0)}
                      sub={`${data.summary.retailCount ?? 0} sales`}
                      valueClassName="text-primary"
                    />
                    <MetricCell
                      label="Transfers"
                      value={formatCurrency(data.summary.transferValue ?? 0)}
                      sub={`${data.summary.transferCount ?? 0} xfers`}
                    />
                    <MetricCell
                      label="Imports"
                      value={formatCurrency(data.summary.importValue ?? 0)}
                      sub={`${data.summary.importCount ?? 0} batches`}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <MetricCell
                  label="Retail revenue"
                  value={formatCurrency(data.summary.totalRevenue ?? 0)}
                  valueClassName="text-[#3b82c4]"
                />
                <MetricCell
                  label="Retail profit"
                  value={formatCurrency(data.summary.totalProfit ?? 0)}
                  valueClassName="text-[#16a34a]"
                  sensitive
                />
                <MetricCell
                  label={creditToOwnerLabel()}
                  value={formatCurrency(data.summary.ownerCreditTotal ?? 0)}
                  valueClassName="text-warning"
                />
                <MetricCell
                  label="Clients owe you"
                  value={formatCurrency(data.summary.clientsOweYou ?? 0)}
                  valueClassName="text-success"
                />
                <MetricCell label="Sales count" value={String(data.summary.salesCount ?? 0)} />
                <MetricCell
                  label="Collected"
                  value={formatCurrency(data.summary.totalCollected ?? 0)}
                  valueClassName="text-success"
                />
                <MetricCell label="Avg sale" value={formatCurrency(data.summary.avgSale ?? 0)} />
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card hover>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Revenue & Profit Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  <LineChart
                    labels={data.trends.labels}
                    series={[
                      {
                        key: "revenue",
                        label: "Revenue",
                        color: REVENUE_COLOR,
                        values: data.trends.revenue,
                      },
                      {
                        key: "profit",
                        label: "Profit",
                        color: PROFIT_COLOR,
                        values: data.trends.profit,
                      },
                    ]}
                    formatValue={formatCompact}
                  />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card hover>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    {creditToOwnerTrendLabel()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  <LineChart
                    labels={data.trends.labels}
                    series={[
                      {
                        key: "daily",
                        label: "Daily change",
                        color: "#c4a35a",
                        values: data.trends.ownerCreditDaily,
                      },
                      {
                        key: "cumulative",
                        label: "Running total",
                        color: "#8aab9a",
                        values: data.trends.ownerCreditCumulative,
                      },
                    ]}
                    formatValue={formatCompact}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div
            className={`grid gap-6 mb-6 ${
              isAdmin && channel === "all" && data.saleTypeBreakdown ? "lg:grid-cols-2" : "max-w-md"
            }`}
          >
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card hover className="h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-primary" />
                    Payment Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  <DonutChart
                    items={data.paymentBreakdown}
                    formatValue={(v) => formatCurrency(v)}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {isAdmin && channel === "all" && data.saleTypeBreakdown ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <Card hover className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-primary" />
                      Revenue by Channel
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    <DonutChart
                      items={data.saleTypeBreakdown}
                      formatValue={(v) => formatCurrency(v)}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}
          </div>

          {isAdmin && (
            <div className="grid gap-6 lg:grid-cols-2 mb-6">
              {data.topProducts && data.topProducts.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Top Products by Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="pb-2 pr-3">Product</th>
                            <th className="pb-2 pr-3 text-right">Items</th>
                            <th className="pb-2 pr-3 text-right">Revenue</th>
                            <th className="pb-2 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.topProducts.map((product) => (
                            <tr key={product.name} className="border-b border-border/60">
                              <td className="py-2 pr-3 font-medium">{product.name}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{product.itemsSold}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(product.revenue)}</td>
                              <td className="py-2 text-right tabular-nums text-success">{formatCurrency(product.profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.expenseBreakdown && data.expenseBreakdown.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Expenses by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.expenseBreakdown.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{row.label}</span>
                          <span className="shrink-0 font-semibold text-destructive tabular-nums">
                            {formatCurrency(row.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.salesByShop && data.salesByShop.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Retail by Shop</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.salesByShop.map((shop) => (
                        <div key={shop.name} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{shop.name}</span>
                          <span className="text-muted-foreground">{shop.count} sales</span>
                          <span className="font-semibold tabular-nums">{formatCurrency(shop.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.bankBalances && data.bankBalances.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Bank Balances (Current)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.bankBalances.map((bank) => (
                        <div key={bank.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{bank.name}</span>
                          <span className="text-muted-foreground">{bank.paymentCount} payments</span>
                          <span className="font-semibold text-primary tabular-nums">{formatCurrency(bank.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {isAdmin && data.recentSales && data.recentSales.length > 0 && (
            <Card hover className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">Recent Sales in Period</CardTitle>
                <Input
                  type="search"
                  placeholder="Search sales…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="h-8 w-48 text-sm"
                />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3">Sale #</th>
                        <th className="pb-2 pr-3">Date</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">Client / Shop</th>
                        <th className="pb-2 pr-3">Salesperson</th>
                        <th className="pb-2 pr-3 text-right">Total</th>
                        <th className="pb-2 pr-3 text-right">Paid</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentSales
                        .filter((sale) => {
                          if (!tableSearch.trim()) return true;
                          const q = tableSearch.toLowerCase();
                          return (
                            sale.saleNumber.toLowerCase().includes(q) ||
                            (sale.client?.toLowerCase().includes(q) ?? false) ||
                            (sale.shop?.toLowerCase().includes(q) ?? false) ||
                            (sale.salesperson?.toLowerCase().includes(q) ?? false) ||
                            sale.type.toLowerCase().includes(q) ||
                            sale.status.toLowerCase().includes(q)
                          );
                        })
                        .map((sale) => (
                        <tr key={sale.id} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-medium">{sale.saleNumber}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(sale.date)}</td>
                          <td className="py-2 pr-3">{sale.type}</td>
                          <td className="py-2 pr-3">{sale.client ?? sale.shop ?? "—"}</td>
                          <td className="py-2 pr-3">{sale.salesperson ?? "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(sale.total)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(sale.paid)}</td>
                          <td className="py-2">{sale.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <div className="grid gap-6 lg:grid-cols-2 mb-6">
              {data.recentExpenses && data.recentExpenses.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.recentExpenses.map((expense) => (
                        <div key={expense.id} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(expense.date)}
                              {expense.bank && ` · ${expense.bank}`}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold text-destructive tabular-nums">
                            -{formatCurrency(expense.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.recentTransfers && data.recentTransfers.length > 0 && (
                <Card hover>
                  <CardHeader>
                    <CardTitle className="text-base">Bank Transfers in Period</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.recentTransfers.map((transfer) => (
                        <div key={transfer.id} className="border-b border-border/60 pb-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">
                              {transfer.fromBank} → {transfer.toBank}
                            </span>
                            <span className="font-semibold text-primary tabular-nums">
                              {formatCurrency(transfer.amount)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDateTime(transfer.date)}
                            {transfer.notes && ` · ${transfer.notes}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
