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
import { Role } from "@prisma/client";

type EntryType = "CREDIT" | "DEBIT";

interface ChinaRmbEntry {
  id: string;
  type: EntryType;
  amount: string;
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
}

function parseAmount(value: string) {
  const amount = parseFloat(value);
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

  const [entryType, setEntryType] = useState<EntryType>("CREDIT");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
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
    setEntryDate(toDatetimeLocalValue());
    setReference("");
    setNotes("");
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
      const body = {
        type: entryType,
        description,
        amount: parseFloat(amount),
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

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
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
                    const signedAmount = isCredit
                      ? parseAmount(entry.amount)
                      : -parseAmount(entry.amount);

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
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
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <p
                              className={cn(
                                "font-bold",
                                isCredit ? "text-success" : "text-destructive"
                              )}
                            >
                              {isCredit ? "+" : "-"}
                              {formatRmb(Math.abs(signedAmount))}
                            </p>
                            <Badge variant={isCredit ? "success" : "danger"}>{entry.type}</Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(entry)}
                              disabled={actionLoadingId === entry.id}
                              aria-label="Edit entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(entry)}
                              disabled={actionLoadingId === entry.id}
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
