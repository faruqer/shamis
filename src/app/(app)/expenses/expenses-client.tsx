"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Receipt, Pencil, Trash2, DollarSign, CalendarDays, Hash, Search } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { Role } from "@prisma/client";

function parseAmount(value: string) {
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type PeriodMode = "today" | "7d" | "30d" | "all" | "custom";

const PERIOD_OPTIONS: { key: PeriodMode; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isInPeriod(expenseDate: string, period: PeriodMode, customDate: string) {
  if (period === "all") return true;

  const date = new Date(expenseDate);

  if (period === "custom") {
    const [y, m, d] = customDate.split("-").map(Number);
    const dayStart = startOfDay(new Date(y, m - 1, d));
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return date >= dayStart && date <= dayEnd;
  }

  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  if (period === "today") {
    return date >= today && date <= end;
  }

  const days = period === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return date >= start && date <= end;
}

function periodFilterStyles(key: PeriodMode, active: boolean) {
  if (!active) {
    return "border border-border bg-surface hover:border-primary/30 hover:bg-secondary";
  }
  return "bg-primary text-white shadow-md shadow-primary/25";
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: string;
  expenseDate: string;
  notes?: string | null;
  paidById?: string | null;
  bankAccountId?: string | null;
  paidBy?: { name: string };
  bankAccount?: { id: string; name: string } | null;
}

export function ExpensesClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const isShopStaff = user.role === Role.SALESPERSON;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [banks, setBanks] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => toDatetimeLocalValue());
  const [bankAccountId, setBankAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodMode>("30d");
  const [customDate, setCustomDate] = useState(() => toDateInputValue(new Date()));

  const expenseCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.description).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [expenses]
  );

  const activeBanks = useMemo(() => banks.filter((b) => b.isActive), [banks]);
  const pastCategories = expenseCategories;

  const summary = useMemo(() => {
    const totalAmount = expenses.reduce((sum, expense) => sum + parseAmount(expense.amount), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = expenses.filter((expense) => new Date(expense.expenseDate) >= monthStart);
    const thisMonthAmount = thisMonth.reduce((sum, expense) => sum + parseAmount(expense.amount), 0);

    return {
      totalCount: expenses.length,
      totalAmount,
      thisMonthCount: thisMonth.length,
      thisMonthAmount,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      if (!isInPeriod(expense.expenseDate, period, customDate)) return false;

      if (!query) return true;

      const haystack = [
        expense.description,
        expense.bankAccount?.name,
        formatCurrency(expense.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [expenses, search, period, customDate]);

  const filteredSummary = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, expense) => sum + parseAmount(expense.amount), 0);
    return {
      count: filteredExpenses.length,
      totalAmount,
    };
  }, [filteredExpenses]);

  const hasActiveFilters = search.trim() !== "" || period !== "30d";

  function loadExpenses() {
    fetch("/api/expenses")
      .then((r) => r.json())
      .then(setExpenses)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadExpenses();
    fetch("/api/banks").then((r) => r.json()).then(setBanks).catch(() => {});
  }, []);

  function resetForm() {
    setEditingExpenseId(null);
    setDescription("");
    setAmount("");
    setExpenseDate(toDatetimeLocalValue());
    setBankAccountId("");
  }

  function openForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(expense: Expense) {
    setEditingExpenseId(expense.id);
    setDescription(expense.description);
    setAmount(String(parseFloat(expense.amount)));
    setExpenseDate(toDatetimeLocalValue(new Date(expense.expenseDate)));
    setBankAccountId(expense.bankAccountId ?? expense.bankAccount?.id ?? "");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    try {
      const body = {
        description,
        amount: parseFloat(amount),
        expenseDate,
        bankAccountId,
      };

      const res = await fetch(editingExpenseId ? `/api/expenses/${editingExpenseId}` : "/api/expenses", {
        method: editingExpenseId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${editingExpenseId ? "update" : "create"} expense`);
      }
      closeForm();
      loadExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(expense: Expense) {
    if (
      !confirm(
        `Delete this expense?\n\n${expense.description} — ${formatCurrency(expense.amount)}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setActionLoadingId(expense.id);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete expense");
      if (editingExpenseId === expense.id) closeForm();
      loadExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setActionLoadingId(null);
    }
  }

  const expenseForm = (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label>Category *</Label>
        <Input
          list="expense-categories"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="New category or pick existing"
          required
        />
        <datalist id="expense-categories">
          {pastCategories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Type a new payment category or select from previous expenses
        </p>
      </div>
      <div className="space-y-2">
        <Label>Amount *</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Date &amp; Time *</Label>
        <Input
          type="datetime-local"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Bank Account *</Label>
        <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
          <option value="">Select bank...</option>
          {activeBanks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          This amount will be deducted from the selected bank balance
        </p>
        {activeBanks.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No banks configured. Add banks in Bank Accounts first.
          </p>
        )}
      </div>
      {isShopStaff && (
        <div className="md:col-span-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          This expense is deducted from money you owe {OWNER_NAME}.
        </div>
      )}
      <div className="md:col-span-2 flex gap-3">
        <Button type="button" variant="outline" onClick={closeForm} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={formLoading} className="flex-1" size="lg">
          {editingExpenseId ? "Save Changes" : "Save Expense"}
        </Button>
      </div>
    </form>
  );

  return (
    <DashboardLayout
      user={user}
      title="Expenses"
      description={
        isShopStaff
          ? "Record shop expenses paid from your collected money"
          : "Track warehouse, shop, tax and other costs"
      }
      action={
        <Button onClick={openForm}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      }
    >
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingExpenseId ? "Edit Expense" : "New Expense"}
        description={
          editingExpenseId
            ? "Update this expense record"
            : isShopStaff
              ? "Record shop expense paid from your collected money"
              : "Record an expense paid from a bank account"
        }
        className="max-w-2xl"
      >
        <div className="px-6 py-4">{expenseForm}</div>
      </Modal>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatCard
              compact
              title="Total Expenses"
              value={String(summary.totalCount)}
              icon={<Hash className="h-4 w-4" />}
              delay={0}
            />
            <StatCard
              compact
              title="Total Spent"
              value={formatCurrency(summary.totalAmount)}
              icon={<DollarSign className="h-4 w-4" />}
              delay={0.05}
              valueClassName="text-destructive"
            />
            <StatCard
              compact
              title={`This Month (${summary.thisMonthCount})`}
              value={formatCurrency(summary.thisMonthAmount)}
              icon={<CalendarDays className="h-4 w-4" />}
              delay={0.1}
              valueClassName={summary.thisMonthAmount > 0 ? "text-destructive" : undefined}
            />
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title="No expenses"
              description={
                isShopStaff
                  ? "Record shop expenses you paid from collected sales money"
                  : "Record warehouse, shop or tax expenses here"
              }
            />
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search category, bank, amount..."
                    className="pl-9"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-2">
                    {PERIOD_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setPeriod(option.key)}
                        className={cn(
                          "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                          periodFilterStyles(option.key, period === option.key)
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground shrink-0">Specific date</Label>
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => {
                        setCustomDate(e.target.value);
                        setPeriod("custom");
                      }}
                      className={cn(
                        "w-auto min-w-[160px]",
                        period === "custom" && "ring-2 ring-primary/30 border-primary"
                      )}
                    />
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setPeriod("30d");
                        setCustomDate(toDateInputValue(new Date()));
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  )}

                  <span className="ml-auto text-xs text-muted-foreground">
                    Showing {filteredSummary.count} of {expenses.length}
                    {filteredSummary.count > 0 && ` · ${formatCurrency(filteredSummary.totalAmount)}`}
                  </span>
                </div>
              </div>

              {filteredExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No matching expenses</p>
              ) : (
            <div className="space-y-3">
              {filteredExpenses.map((expense, index) => {
                const isActionLoading = actionLoadingId === expense.id;  return (
                <motion.div key={expense.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                  <Card hover>
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{expense.description}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDateTime(expense.expenseDate)}
                          {expense.bankAccount && ` · ${expense.bankAccount.name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-lg font-bold text-destructive">-{formatCurrency(expense.amount)}</p>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => openEditForm(expense)}
                            aria-label="Edit expense"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isActionLoading}
                            loading={isActionLoading}
                            onClick={() => handleDelete(expense)}
                            aria-label="Delete expense"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
                );
              })}
            </div>
              )}
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
