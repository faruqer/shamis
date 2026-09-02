"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Coins,
  ArrowUpCircle,
  ArrowDownCircle,
  Pencil,
  Trash2,
  Search,
  CircleCheck,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { cn, formatDateTime, formatRmb } from "@/lib/utils";
import { getChinaRmbPaymentStatus } from "@/lib/china-rmb";
import { Role } from "@prisma/client";

type EntryType = "CREDIT" | "DEBIT";
type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

interface ChinaRmbEntry {
  id: string;
  type: EntryType;
  amount: string;
  paidAmount: string;
  description: string;
  notes?: string | null;
  reference?: string | null;
  entryDate: string;
  createdBy?: { name: string };
}

interface ChinaRmbData {
  entries: ChinaRmbEntry[];
  balance: number;
  totalCredit: number;
  totalDebit: number;
  totalOutstanding: number;
}

function parseAmount(value: string | number) {
  const amount = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ChinaRmbClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const [data, setData] = useState<ChinaRmbData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [paymentEntry, setPaymentEntry] = useState<ChinaRmbEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [entryType, setEntryType] = useState<EntryType>("CREDIT");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [entryDate, setEntryDate] = useState(() => toDatetimeLocalValue());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function loadData() {
    setLoading(true);
    fetch("/api/china-rmb")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load China RMB entries");
        return r.json();
      })
      .then(setData)
      .catch((err) => alert(err instanceof Error ? err.message : "Failed to load data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data.entries;

    return data.entries.filter((entry) => {
      const haystack = [
        entry.description,
        entry.reference,
        entry.notes,
        entry.type,
        formatRmb(entry.amount),
        formatRmb(entry.paidAmount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, search]);

  function resetForm() {
    setEditingEntryId(null);
    setEntryType("CREDIT");
    setDescription("");
    setAmount("");
    setPaidAmount("");
    setEntryDate(toDatetimeLocalValue());
    setReference("");
    setNotes("");
  }

  function openPaymentModal(entry: ChinaRmbEntry) {
    setPaymentEntry(entry);
    setPaymentAmount(String(parseAmount(entry.paidAmount)));
  }

  function closePaymentModal() {
    setPaymentEntry(null);
    setPaymentAmount("");
  }

  function openForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(entry: ChinaRmbEntry) {
    setEditingEntryId(entry.id);
    setEntryType(entry.type);
    setDescription(entry.description);
    setAmount(String(parseAmount(entry.amount)));
    setPaidAmount(String(parseAmount(entry.paidAmount)));
    setEntryDate(toDatetimeLocalValue(new Date(entry.entryDate)));
    setReference(entry.reference ?? "");
    setNotes(entry.notes ?? "");
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
      const entryAmount = parseFloat(amount);
      const entryPaidAmount = paidAmount.trim() === "" ? 0 : parseFloat(paidAmount);
      if (entryPaidAmount > entryAmount + 0.001) {
        throw new Error("Paid amount cannot exceed the entry amount");
      }

      const body = {
        type: entryType,
        description,
        amount: entryAmount,
        paidAmount: entryPaidAmount,
        entryDate,
        reference: reference || undefined,
        notes: notes || undefined,
      };

      const res = await fetch(editingEntryId ? `/api/china-rmb/${editingEntryId}` : "/api/china-rmb", {
        method: editingEntryId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || `Failed to ${editingEntryId ? "update" : "create"} entry`);
      }

      closeForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(entry: ChinaRmbEntry) {
    if (
      !confirm(
        `Delete this ${entry.type.toLowerCase()} entry?\n\n${entry.description} — ${formatRmb(entry.amount)}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setActionLoadingId(entry.id);
    try {
      const res = await fetch(`/api/china-rmb/${entry.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete entry");
      if (editingEntryId === entry.id) closeForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentEntry) return;

    setPaymentLoading(true);
    try {
      const totalAmount = parseAmount(paymentEntry.amount);
      const nextPaidAmount = parseFloat(paymentAmount);
      if (!Number.isFinite(nextPaidAmount) || nextPaidAmount < 0) {
        throw new Error("Enter a valid paid amount");
      }
      if (nextPaidAmount > totalAmount + 0.001) {
        throw new Error("Paid amount cannot exceed the entry amount");
      }

      const res = await fetch(`/api/china-rmb/${paymentEntry.id}/paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: nextPaidAmount }),
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to update paid amount");
      }

      closePaymentModal();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update paid amount");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleMarkFullyPaid(entry: ChinaRmbEntry) {
    setActionLoadingId(entry.id);
    try {
      const res = await fetch(`/api/china-rmb/${entry.id}/paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: parseAmount(entry.amount) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to mark as paid");
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setActionLoadingId(null);
    }
  }

  function paymentStatusBadge(status: PaymentStatus) {
    if (status === "PAID") return <Badge variant="success">Paid</Badge>;
    if (status === "PARTIAL") return <Badge variant="warning">Partial</Badge>;
    return <Badge variant="default">Unpaid</Badge>;
  }

  const entryForm = (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label>Type *</Label>
        <Select value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)} required>
          <option value="CREDIT">Credit (money in)</option>
          <option value="DEBIT">Debit (money out)</option>
        </Select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Description *</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Supplier payment, remittance received"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Amount (RMB) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Paid Amount (RMB)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={paidAmount}
          onChange={(e) => setPaidAmount(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Date &amp; Time *</Label>
        <Input
          type="datetime-local"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Reference</Label>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Invoice, transfer ID, etc."
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>
      <div className="md:col-span-2 flex gap-3">
        <Button type="button" variant="outline" onClick={closeForm} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={formLoading} className="flex-1" size="lg">
          {editingEntryId ? "Save Changes" : "Save Entry"}
        </Button>
      </div>
    </form>
  );

  const paymentForm = paymentEntry ? (
    <form onSubmit={handlePaymentSubmit} className="grid gap-4">
      <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
        <p className="font-medium">{paymentEntry.description}</p>
        <p className="text-muted-foreground">
          Total: {formatRmb(paymentEntry.amount)} · Already paid: {formatRmb(paymentEntry.paidAmount)}
        </p>
      </div>
      <div className="space-y-2">
        <Label>Paid amount (RMB) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max={parseAmount(paymentEntry.amount)}
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Set how much has been paid for this entry. Remaining:{" "}
          {formatRmb(Math.max(0, parseAmount(paymentEntry.amount) - parseFloat(paymentAmount || "0")))}
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => setPaymentAmount(String(parseAmount(paymentEntry.amount)))}
        >
          Full amount
        </Button>
        <Button type="button" variant="outline" onClick={closePaymentModal} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={paymentLoading} className="flex-1">
          Save
        </Button>
      </div>
    </form>
  ) : null;

  return (
    <DashboardLayout
      user={user}
      title="China RMB"
      description="Track RMB credit and debit separately from stock and local currency"
      action={
        <Button onClick={openForm}>
          <Plus className="h-4 w-4" /> Add Entry
        </Button>
      }
    >
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingEntryId ? "Edit Entry" : "New Entry"}
        description="Record a credit or debit in Chinese Yuan (RMB)"
        className="max-w-2xl"
      >
        <div className="px-6 py-4">{entryForm}</div>
      </Modal>

      <Modal
        open={!!paymentEntry}
        onClose={closePaymentModal}
        title="Record Payment"
        description="Mark how much has been paid on this entry"
        className="max-w-md"
      >
        <div className="px-6 py-4">{paymentForm}</div>
      </Modal>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              compact
              title="Current Balance"
              value={formatRmb(data?.balance ?? 0)}
              icon={<Coins className="h-4 w-4" />}
              delay={0}
            />
            <StatCard
              compact
              title="Total Credits"
              value={formatRmb(data?.totalCredit ?? 0)}
              icon={<ArrowUpCircle className="h-4 w-4" />}
              delay={0.05}
            />
            <StatCard
              compact
              title="Total Debits"
              value={formatRmb(data?.totalDebit ?? 0)}
              icon={<ArrowDownCircle className="h-4 w-4" />}
              delay={0.1}
            />
            <StatCard
              compact
              title="Unsettled"
              value={formatRmb(data?.totalOutstanding ?? 0)}
              icon={<CircleCheck className="h-4 w-4" />}
              delay={0.15}
            />
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries..."
                className="pl-9"
              />
            </div>
            {search && (
              <p className="text-sm text-muted-foreground">
                {filteredEntries.length} of {data?.entries.length ?? 0} entries
              </p>
            )}
          </div>

          {!data || data.entries.length === 0 ? (
            <EmptyState
              icon={<Coins className="h-8 w-8" />}
              title="No RMB entries yet"
              description="Add credits and debits to track your China RMB balance"
            />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon={<Search className="h-8 w-8" />}
              title="No matching entries"
              description="Try a different search term"
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredEntries.map((entry, index) => {
                    const isCredit = entry.type === "CREDIT";
                    const entryAmount = parseAmount(entry.amount);
                    const entryPaidAmount = parseAmount(entry.paidAmount);
                    const paymentStatus = getChinaRmbPaymentStatus(entryAmount, entryPaidAmount);
                    const remaining = Math.max(0, entryAmount - entryPaidAmount);
                    const isActionLoading = actionLoadingId === entry.id;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {isCredit ? (
                            <ArrowUpCircle className="h-5 w-5 shrink-0 text-success" />
                          ) : (
                            <ArrowDownCircle className="h-5 w-5 shrink-0 text-destructive" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(entry.entryDate)}
                              {entry.reference && ` · Ref: ${entry.reference}`}
                            </p>
                            {entry.notes && (
                              <p className="mt-1 text-xs text-muted-foreground truncate">{entry.notes}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              Paid: {formatRmb(entryPaidAmount)} / {formatRmb(entryAmount)}
                              {remaining > 0 && ` · Remaining: ${formatRmb(remaining)}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                          <div className="text-right">
                            <p
                              className={cn(
                                "font-bold",
                                isCredit ? "text-success" : "text-destructive"
                              )}
                            >
                              {isCredit ? "+" : "-"}
                              {formatRmb(entryAmount)}
                            </p>
                            <div className="mt-1 flex flex-wrap justify-end gap-1">
                              <Badge variant={isCredit ? "success" : "danger"}>{entry.type}</Badge>
                              {paymentStatusBadge(paymentStatus)}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {paymentStatus !== "PAID" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleMarkFullyPaid(entry)}
                              >
                                <CircleCheck className="h-4 w-4" />
                                <span className="hidden sm:inline">Mark paid</span>
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() => openPaymentModal(entry)}
                            >
                              Paid
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(entry)}
                              disabled={isActionLoading}
                              aria-label="Edit entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(entry)}
                              disabled={isActionLoading}
                              aria-label="Delete entry"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
