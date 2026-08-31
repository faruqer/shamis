"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Warehouse,
  Store,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Wallet,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { creditToOwnerLabel } from "@/lib/brand";
import { Role } from "@prisma/client";
import { LoadingSpinner } from "@/components/layout/page-transition";

const CHART_SALES_COLOR = "#8b5cf6";
const CHART_REVENUE_COLOR = "#2563eb";

interface LowStockProduct {
  name: string;
  remainingItems: number;
  stockPercent: number;
  location?: string;
}

interface SalesTrend {
  labels: string[];
  salesCount: number[];
  revenue: number[];
}

interface AdminDashboardData {
  scoped: false;
  imports: number;
  warehouse: { products: number; items: number };
  shop: { products: number; items: number };
  wholesale: { count: number; total: number; collected: number };
  retail: { count: number; total: number; collected: number };
  expenses: number;
  customerCredit: number;
  customerCreditCount: number;
  salespersonCredit: number;
  heldBySalesperson: { name: string; amount: number }[];
  lowStock: LowStockProduct[];
  salesTrend: SalesTrend;
  recentSales: {
    id: string;
    saleNumber: string;
    type: string;
    totalAmount: string;
    paymentStatus: string;
    saleDate: string;
    client?: { name: string };
    soldBy?: { name: string };
    retailSoldBy?: { name: string };
  }[];
}

interface SalespersonDashboardData {
  scoped: true;
  shopName?: string | null;
  shop: { products: number; items: number };
  retail: { count: number; total: number; collected: number };
  customerCredit: number;
  customerCreditCount: number;
  salespersonCredit: number;
  lowStock: LowStockProduct[];
  salesTrend: SalesTrend;
  recentSales: {
    id: string;
    saleNumber: string;
    totalAmount: string;
    paymentStatus: string;
    saleDate: string;
    client?: { name: string };
    retailSoldBy?: { name: string };
  }[];
}

type DashboardData = AdminDashboardData | SalespersonDashboardData;

function isSalespersonDashboard(data: DashboardData): data is SalespersonDashboardData {
  return data.scoped === true;
}

function isAdminDashboard(data: DashboardData): data is AdminDashboardData {
  return data.scoped === false;
}

interface DashboardUser {
  name: string;
  role: Role;
  email: string;
  shopName?: string | null;
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function LowStockPanel({
  items,
  showLocation = false,
}: {
  items: LowStockProduct[];
  showLocation?: boolean;
}) {
  return (
    <Card hover className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Low Stock
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">All products are well stocked</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={`${item.location ?? "shop"}-${item.name}`}
                className="rounded-lg border border-[#ddd0b8] bg-[#faf6ee] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.remainingItems} items left
                      {showLocation && item.location ? ` · ${item.location}` : ""}
                    </p>
                  </div>
                  <Badge variant={item.stockPercent <= 10 ? "danger" : "warning"}>
                    {item.stockPercent}%
                  </Badge>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ddd0b8]/50">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      item.stockPercent <= 10 ? "bg-destructive" : "bg-warning"
                    )}
                    style={{ width: `${Math.max(item.stockPercent, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SalesTrendPanel({ trend, title }: { trend: SalesTrend; title: string }) {
  return (
    <Card hover className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart
          labels={trend.labels}
          series={[
            {
              key: "sales",
              label: "Sales",
              color: CHART_SALES_COLOR,
              values: trend.salesCount,
            },
            {
              key: "revenue",
              label: "Revenue",
              color: CHART_REVENUE_COLOR,
              values: trend.revenue,
            },
          ]}
          formatValue={formatCompact}
        />
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ user }: { user: DashboardUser }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Failed to load dashboard");
        }
        if (body.scoped !== true && body.scoped !== false) {
          throw new Error("Unexpected dashboard response");
        }
        setData(body);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardLayout user={user} title="Dashboard"><LoadingSpinner /></DashboardLayout>;
  if (error) {
    return (
      <DashboardLayout user={user} title="Dashboard">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </DashboardLayout>
    );
  }
  if (!data) return null;

  const statusVariant = (status: string) => {
    if (status === "PAID") return "success";
    if (status === "PARTIAL") return "warning";
    return "danger";
  };

  if (isSalespersonDashboard(data)) {
    return (
      <DashboardLayout
        user={user}
        title="Dashboard"
        description={data.shopName ? `${data.shopName} overview` : "Your shop overview"}
      >
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
          <StatCard
            compact
            title="Shop Products"
            value={String(data.shop.products)}
            subtitle={`${data.shop.items} items in stock`}
            icon={<Store className="h-4 w-4" />}
            delay={0}
          />
          <StatCard
            compact
            title="Retail Sales"
            value={String(data.retail.count)}
            subtitle="Total sales recorded"
            icon={<Receipt className="h-4 w-4" />}
            delay={0.05}
          />
          <StatCard
            compact
            title="Collected"
            value={formatCurrency(data.retail.collected)}
            subtitle="Payments received"
            icon={<DollarSign className="h-4 w-4" />}
            delay={0.1}
            valueClassName="text-success"
          />
          <StatCard
            compact
            title="Customer Credit"
            value={formatCurrency(data.customerCredit)}
            subtitle={`${data.customerCreditCount} unpaid sale${data.customerCreditCount !== 1 ? "s" : ""}`}
            icon={<AlertCircle className="h-4 w-4" />}
            delay={0.15}
            valueClassName={data.customerCredit > 0 ? "text-warning" : undefined}
          />
          <StatCard
            compact
            title={creditToOwnerLabel()}
            value={formatCurrency(data.salespersonCredit)}
            subtitle="Collected sales owed to owner"
            icon={<Wallet className="h-4 w-4" />}
            delay={0.2}
            valueClassName={data.salespersonCredit > 0 ? "text-warning" : undefined}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <SalesTrendPanel trend={data.salesTrend} title="Sales Trend (14 days)" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <LowStockPanel items={data.lowStock} />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6"
        >
          <Card hover>
            <CardHeader>
              <CardTitle>Recent Shop Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales yet</p>
              ) : (
                <div className="space-y-3">
                  {data.recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="font-medium text-sm">{sale.saleNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.client?.name || "Walk-in"} · {formatDate(sale.saleDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(sale.totalAmount)}</p>
                        <Badge variant={statusVariant(sale.paymentStatus)}>{sale.paymentStatus}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </DashboardLayout>
    );
  }

  if (!isAdminDashboard(data)) {
    return (
      <DashboardLayout user={user} title="Dashboard">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unexpected dashboard response
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      user={user}
      title="Dashboard"
      description="Overview of your stock and money management"
    >
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard
          compact
          title="Total Imports"
          value={String(data.imports)}
          subtitle="China import batches"
          icon={<Package className="h-4 w-4" />}
          delay={0}
        />
        <StatCard
          compact
          title="Warehouse Products"
          value={String(data.warehouse.products)}
          subtitle={`${data.warehouse.items} items remaining`}
          icon={<Warehouse className="h-4 w-4" />}
          delay={0.05}
        />
        <StatCard
          compact
          title="Shop Products"
          value={String(data.shop.products)}
          subtitle={`${data.shop.items} items remaining`}
          icon={<Store className="h-4 w-4" />}
          delay={0.1}
        />
        <StatCard
          compact
          title="Wholesale Sales"
          value={String(data.wholesale.count)}
          subtitle={`${formatCurrency(data.wholesale.collected)} collected`}
          icon={<TrendingUp className="h-4 w-4" />}
          delay={0.15}
        />
        <StatCard
          compact
          title="Salesperson Credit"
          value={formatCurrency(data.salespersonCredit)}
          subtitle="Held by salespersons for owner"
          icon={<Wallet className="h-4 w-4" />}
          delay={0.18}
          valueClassName={data.salespersonCredit > 0 ? "text-warning" : undefined}
        />
        <StatCard
          compact
          title="Total Expenses"
          value={formatCurrency(data.expenses)}
          subtitle="All recorded costs"
          icon={<Receipt className="h-4 w-4" />}
          delay={0.2}
          valueClassName="text-destructive"
        />
        <StatCard
          compact
          title="Customer Credit"
          value={formatCurrency(data.customerCredit)}
          subtitle={`${data.customerCreditCount} credit sale${data.customerCreditCount !== 1 ? "s" : ""}`}
          icon={<AlertCircle className="h-4 w-4" />}
          delay={0.25}
          valueClassName={data.customerCredit > 0 ? "text-warning" : undefined}
        />
        <StatCard
          compact
          title="Retail Sales"
          value={String(data.retail.count)}
          subtitle={`${formatCurrency(data.retail.collected)} collected`}
          icon={<DollarSign className="h-4 w-4" />}
          delay={0.28}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <SalesTrendPanel trend={data.salesTrend} title="Sales Trend (14 days)" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <LowStockPanel items={data.lowStock} showLocation />
        </motion.div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {user.role === Role.ADMIN && data.heldBySalesperson.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <Card hover>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Salesperson Credit Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.heldBySalesperson.map((sp) => (
                    <div key={sp.name} className="flex items-center justify-between rounded-lg bg-muted p-3">
                      <span className="font-medium">{sp.name}</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(sp.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <Card hover>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales yet</p>
              ) : (
                <div className="space-y-3">
                  {data.recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="font-medium text-sm">{sale.saleNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.client?.name || sale.type} · {formatDate(sale.saleDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(sale.totalAmount)}</p>
                        <Badge variant={statusVariant(sale.paymentStatus)}>{sale.paymentStatus}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
