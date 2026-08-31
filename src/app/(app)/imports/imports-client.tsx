"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Package, Pencil, Trash2, CheckCircle2, Receipt, CreditCard } from "lucide-react";
import { ImportCostsModal } from "@/components/imports/import-costs-modal";
import { ImportCreditDetailsModal } from "@/components/imports/import-credit-details-modal";
import { PayImportCreditModal } from "@/components/imports/pay-import-credit-modal";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  getImportCostsTotal,
  getImportCreditOutstanding,
  getImportCreditPaidAmount,
  getImportTotalValue,
  getImportsSummary,
  getProductLandedValue,
  type ImportLike,
} from "@/lib/import-utils";
import { Role } from "@prisma/client";

interface ImportRecord {
  id: string;
  batchNumber: string;
  importDate: string;
  customCost: string;
  creditAmount: string;
  creditPaidAmount: string;
  creditPaid: boolean;
  notes: string | null;
  createdBy: { name: string };
  currentProfit?: number;
  creditPersons?: { id: string; name: string; amount: string; paidAmount?: string }[];
  costs?: { id: string; name: string; amount: string }[];
  products: {
    id: string;
    name: string;
    unitCost?: string;
    cartons: {
      totalCartons: number;
      itemsPerCarton: number;
      remainingCartons: number;
      remainingItems: number;
    }[];
  }[];
}

function toImportLike(imp: ImportRecord): ImportLike {
  return {
    customCost: imp.customCost,
    costs: imp.costs?.map((cost) => ({ name: cost.name, amount: cost.amount })),
    creditAmount: imp.creditAmount,
    creditPaidAmount: imp.creditPaidAmount,
    creditPaid: imp.creditPaid,
    products: (imp.products ?? []).map((product) => ({
      unitCost: product.unitCost ?? "0",
      cartons: product.cartons.map((carton) => ({
        totalCartons: carton.totalCartons,
        itemsPerCarton: carton.itemsPerCarton,
        remainingCartons: carton.remainingCartons,
        remainingItems: carton.remainingItems,
      })),
    })),
  };
}

function SummaryStat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold leading-snug tabular-nums",
          highlight ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ImportsPageClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const isAdmin = user.role === Role.ADMIN;
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [costsModalImport, setCostsModalImport] = useState<ImportRecord | null>(null);
  const [creditDetailsImport, setCreditDetailsImport] = useState<ImportRecord | null>(null);
  const [payCreditImport, setPayCreditImport] = useState<ImportRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const loadImports = useCallback(() => {
    setLoading(true);
    setLoadError("");
    fetch("/api/imports")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load imports");
        if (!Array.isArray(data)) throw new Error("Invalid imports response");
        return data as ImportRecord[];
      })
      .then(setImports)
      .catch((err) => {
        setImports([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load imports");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  async function handleDelete(id: string, batchNumber: string) {
    if (!confirm(`Delete import batch "${batchNumber}"? This cannot be undone.`)) return;

    setDeletingId(id);
    setDeleteError("");

    try {
      const res = await fetch(`/api/imports/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete import");
      setImports((prev) => prev.filter((imp) => imp.id !== id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete import");
    } finally {
      setDeletingId(null);
    }
  }

  const summary = getImportsSummary(imports.map(toImportLike));

  return (
    <DashboardLayout
      user={user}
      title="Imports"
      description={
        isAdmin
          ? "Manage China import batches and products"
          : "Record import batches — costs and credit are managed by the owner"
      }
      action={
        <Link href="/imports/new">
          <Button>
            <Plus className="h-4 w-4" /> New Import
          </Button>
        </Link>
      }
    >
      {deleteError && (
        <div className="mb-4 rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">
          {deleteError}
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">
          {loadError}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : imports.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No imports yet"
          description="Start by adding your first import batch from China"
          action={
            <Link href="/imports/new">
              <Button>
                <Plus className="h-4 w-4" /> Add Import
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "mb-5 grid gap-2",
              isAdmin ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"
            )}
          >
            <SummaryStat label="Imports" value={String(summary.importCount)} hint="Batches" />
            {isAdmin && (
              <>
                <SummaryStat
                  label="Total value"
                  value={formatCurrency(summary.totalValue)}
                  hint="All batches"
                />
                <SummaryStat
                  label="Credit due"
                  value={formatCurrency(summary.totalCredit)}
                  hint="Outstanding"
                  highlight={summary.totalCredit > 0}
                />
              </>
            )}
            <SummaryStat
              label="Products"
              value={String(summary.totalProducts)}
              hint="Across batches"
            />
            <SummaryStat
              label="Stock left"
              value={`${summary.remainingCartons} ctns`}
              hint={`${summary.remainingItems} items`}
            />
          </div>

          <div className="grid gap-4">
            {imports.map((imp, index) => {
              const importLike = toImportLike(imp);
              const totalValue = getImportTotalValue(importLike);
              const costsTotal = getImportCostsTotal(importLike);
              const creditOutstanding = getImportCreditOutstanding(importLike);
              const creditPaidAmount = getImportCreditPaidAmount(importLike);
              const creditAmount = parseFloat(imp.creditAmount) || 0;
              const currentProfit = imp.currentProfit ?? 0;

              return (
                <motion.div
                  key={imp.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card hover>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 flex-wrap">
                          Batch {imp.batchNumber}
                          <Badge variant="primary">{imp.products?.length ?? 0} products</Badge>
                          {isAdmin && imp.creditPaid && creditAmount > 0 && (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Credit paid
                            </Badge>
                          )}
                          {isAdmin && !imp.creditPaid && creditOutstanding > 0 && (
                            <Badge variant="warning">
                              {creditPaidAmount > 0 ? "Partial credit" : "On credit"}
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Imported {formatDate(imp.importDate)} by {imp.createdBy.name}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        {isAdmin && (
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</p>
                            <p className="text-xs text-muted-foreground">Total value</p>
                            <p
                              className={cn(
                                "mt-1 text-sm font-semibold tabular-nums",
                                currentProfit > 0
                                  ? "text-success"
                                  : currentProfit < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              )}
                            >
                              {formatCurrency(currentProfit)}
                            </p>
                            <p className="text-xs text-muted-foreground">Current profit</p>
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Link href={`/imports/${imp.id}/edit`}>
                            <Button variant="outline" size="sm" aria-label="Edit import">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Delete import"
                              loading={deletingId === imp.id}
                              onClick={() => handleDelete(imp.id, imp.batchNumber)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isAdmin && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setCostsModalImport(imp)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Costs
                            {costsTotal > 0 && (
                              <span className="font-semibold text-primary">{formatCurrency(costsTotal)}</span>
                            )}
                          </Button>

                          {creditAmount > 0 && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => setCreditDetailsImport(imp)}
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                Credit
                                <span
                                  className={cn(
                                    "font-semibold",
                                    imp.creditPaid ? "text-primary" : "text-warning"
                                  )}
                                >
                                  {imp.creditPaid
                                    ? formatCurrency(creditAmount)
                                    : formatCurrency(creditOutstanding)}
                                </span>
                              </Button>

                              {!imp.creditPaid && creditOutstanding > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => setPayCreditImport(imp)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Pay credit
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Products · {(imp.products ?? []).length}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                          {(imp.products ?? []).map((product) => {
                            const carton = product.cartons[0];
                            const remainingCartons = product.cartons.reduce(
                              (s, c) => s + c.remainingCartons,
                              0
                            );
                            const totalCartons = carton?.totalCartons ?? 0;
                            const productValue = isAdmin
                              ? getProductLandedValue({
                                  unitCost: product.unitCost || 0,
                                  cartons: product.cartons,
                                })
                              : 0;

                            return (
                              <div
                                key={product.id}
                                className="min-w-0 rounded border border-border/70 bg-muted/20 px-2 py-1.5"
                              >
                                <p className="truncate text-[11px] font-semibold leading-tight">
                                  {product.name}
                                </p>
                                <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground tabular-nums">
                                  {isAdmin && (
                                    <>
                                      {formatCurrency(product.unitCost || 0)}/u ·{" "}
                                    </>
                                  )}
                                  {remainingCartons}/{totalCartons} ct
                                </p>
                                {isAdmin && (
                                  <p className="mt-0.5 text-[11px] font-bold leading-tight text-primary tabular-nums">
                                    {formatCurrency(productValue)}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      <ImportCostsModal
        open={Boolean(costsModalImport)}
        onClose={() => setCostsModalImport(null)}
        batchNumber={costsModalImport?.batchNumber ?? ""}
        costs={costsModalImport?.costs ?? []}
      />

      <ImportCreditDetailsModal
        open={Boolean(creditDetailsImport)}
        onClose={() => setCreditDetailsImport(null)}
        importRecord={creditDetailsImport ?? { batchNumber: "", creditAmount: "0", creditPaid: false }}
      />

      {payCreditImport && (
        <PayImportCreditModal
          open={Boolean(payCreditImport)}
          onClose={() => setPayCreditImport(null)}
          importRecord={payCreditImport}
          onPaid={(updated) => {
            setImports((prev) =>
              prev.map((imp) => (imp.id === payCreditImport.id ? (updated as ImportRecord) : imp))
            );
            setDeleteError("");
          }}
        />
      )}
    </DashboardLayout>
  );
}
