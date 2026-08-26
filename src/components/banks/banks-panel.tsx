"use client";

import { useEffect, useState } from "react";
import { Landmark, Plus, Pencil, Trash2, Wallet, ArrowRightLeft, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { StatCard } from "@/components/dashboard/stat-card";
import { Role } from "@prisma/client";
import { cn, formatCurrency } from "@/lib/utils";

interface BankRecord {
  id: string;
  name: string;
  isActive: boolean;
  balance?: number;
  paymentCount?: number;
}

interface BanksPanelProps {
  user: { id?: string; role: Role };
  embedded?: boolean;
  className?: string;
}

export function BanksPanel({ user, embedded = false, className }: BanksPanelProps) {
  const isAdmin = user.role === Role.ADMIN;
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankRecord | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankActive, setBankActive] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [fromBankId, setFromBankId] = useState("");
  const [toBankId, setToBankId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  function loadBanks() {
    setLoading(true);
    Promise.all([fetch("/api/banks/balances").then((r) => r.json()), fetch("/api/banks").then((r) => r.json())])
      .then(([balanceData, banksData]) => {
        const balanceMap = new Map<string, { balance: number; paymentCount: number }>(
          (balanceData.banks ?? []).map((b: BankRecord) => [
            b.id,
            { balance: b.balance ?? 0, paymentCount: b.paymentCount ?? 0 },
          ])
        );

        const merged = (Array.isArray(banksData) ? banksData : []).map((bank: BankRecord) => ({
          ...bank,
          balance: balanceMap.get(bank.id)?.balance ?? 0,
          paymentCount: balanceMap.get(bank.id)?.paymentCount ?? 0,
        }));

        setBanks(merged);
        setTotalBalance(balanceData.totalBalance ?? 0);
      })
      .catch(() => {
        setBanks([]);
        setTotalBalance(0);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadBanks();
  }, []);

  function resetForm() {
    setBankName("");
    setBankActive(true);
    setEditingBank(null);
    setError("");
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(bank: BankRecord) {
    setEditingBank(bank);
    setBankName(bank.name);
    setBankActive(bank.isActive);
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setError("");

    try {
      const payload = { name: bankName.trim(), isActive: bankActive };
      const url = editingBank ? `/api/banks/${editingBank.id}` : "/api/banks";
      const method = editingBank ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save bank");

      setModalOpen(false);
      resetForm();
      loadBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bank");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(bank: BankRecord) {
    const action = isAdmin ? "remove" : "deactivate";
    if (!confirm(`${isAdmin ? "Remove" : "Deactivate"} "${bank.name}"?`)) return;

    setFormLoading(true);
    try {
      if (isAdmin) {
        const res = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to delete bank");
      } else {
        const res = await fetch(`/api/banks/${bank.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: bank.name, isActive: false }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to deactivate bank");
      }
      loadBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} bank`);
    } finally {
      setFormLoading(false);
    }
  }

  function resetTransferForm() {
    setFromBankId("");
    setToBankId("");
    setTransferAmount("");
    setTransferNotes("");
    setTransferError("");
  }

  function openTransfer() {
    resetTransferForm();
    setTransferOpen(true);
  }

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTransferLoading(true);
    setTransferError("");

    try {
      const res = await fetch("/api/banks/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromBankAccountId: fromBankId,
          toBankAccountId: toBankId,
          amount: parseFloat(transferAmount),
          notes: transferNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to transfer money");

      setTransferOpen(false);
      resetTransferForm();
      loadBanks();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Failed to transfer money");
    } finally {
      setTransferLoading(false);
    }
  }

  const activeBanks = banks.filter((b) => b.isActive);

  const actionButtons = (
    <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:justify-end">
      <Button
        variant="outline"
        onClick={openTransfer}
        disabled={activeBanks.length < 2}
        title={activeBanks.length < 2 ? "Add at least two active banks to transfer" : undefined}
        className="flex-1 sm:flex-none"
      >
        <ArrowRightLeft className="h-4 w-4" /> Transfer Money
      </Button>
      <Button onClick={openCreate} className="flex-1 sm:flex-none">
        <Plus className="h-4 w-4" /> Add Bank
      </Button>
    </div>
  );

  const panelHeader = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className={cn("font-semibold", embedded ? "text-base" : "text-lg")}>
          {embedded ? "Bank Accounts" : "Your Banks"}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAdmin
            ? "Manage banks, view balances, and transfer funds"
            : "View balances, add banks, and transfer between accounts"}
        </p>
      </div>
      {actionButtons}
    </div>
  );

  return (
    <section className={className}>
      {panelHeader}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className={cn("grid gap-3 sm:grid-cols-3", embedded ? "mb-4" : "mb-6")}>
            <StatCard
              compact
              title="Total in Banks"
              value={formatCurrency(totalBalance)}
              icon={<Wallet className="h-4 w-4" />}
              delay={0}
              valueClassName="text-primary"
            />
            <StatCard
              compact
              title="Active Banks"
              value={String(activeBanks.length)}
              icon={<Landmark className="h-4 w-4" />}
              delay={0.05}
            />
            <StatCard
              compact
              title="All Accounts"
              value={String(banks.length)}
              icon={<Landmark className="h-4 w-4" />}
              delay={0.1}
            />
          </div>

          {banks.length === 0 ? (
            <EmptyState
              icon={<Landmark className="h-8 w-8" />}
              title="No bank accounts"
              description="Add a bank account for recording bank transfer payments"
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Add Bank
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="hidden sm:grid sm:grid-cols-[1fr_120px_100px_100px_auto] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Bank</span>
                <span className="text-right">Available</span>
                <span className="text-right">Payments</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-border">
                {banks.map((bank) => (
                  <li
                    key={bank.id}
                    className={cn(
                      "px-4 py-3 transition-colors hover:bg-muted/20",
                      !bank.isActive && "opacity-60"
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_120px_100px_100px_auto] sm:items-center sm:gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Landmark className="h-4 w-4 text-primary" />
                        </div>
                        <p className="font-medium truncate">{bank.name}</p>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-primary sm:text-right">
                        {formatCurrency(bank.balance ?? 0)}
                      </p>
                      <p className="text-sm text-muted-foreground tabular-nums sm:text-right">
                        {bank.paymentCount ?? 0}
                      </p>
                      <div>
                        <Badge variant={bank.isActive ? "success" : "default"}>
                          {bank.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(bank)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {bank.isActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDelete(bank)}
                            aria-label={isAdmin ? "Delete bank" : "Deactivate bank"}
                            title={isAdmin ? "Delete bank" : "Deactivate bank"}
                          >
                            {isAdmin ? <Trash2 className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Balances include payments received, expenses paid, and transfers between accounts.
          </p>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingBank ? "Edit Bank" : "Add Bank"}
        description={isAdmin ? undefined : "New banks are active for payments immediately"}
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>Bank Name *</Label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. CBE, Awash, Dashen"
              required
            />
          </div>
          {isAdmin ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={bankActive ? "active" : "inactive"}
                onChange={(e) => setBankActive(e.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          ) : editingBank ? (
            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <input
                type="checkbox"
                checked={bankActive}
                onChange={(e) => setBankActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <span className="text-sm">Active for payments</span>
            </label>
          ) : null}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={formLoading} className="flex-1">
              {editingBank ? "Save Changes" : "Add Bank"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => {
          setTransferOpen(false);
          resetTransferForm();
        }}
        title="Transfer Money"
        description="Move funds from one bank account to another"
        className="max-w-md"
      >
        <form onSubmit={handleTransferSubmit} className="px-6 py-4 space-y-4">
          {transferError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {transferError}
            </div>
          )}
          <div className="space-y-2">
            <Label>From Bank *</Label>
            <Select value={fromBankId} onChange={(e) => setFromBankId(e.target.value)} required>
              <option value="">Select source bank...</option>
              {activeBanks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({formatCurrency(bank.balance ?? 0)})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To Bank *</Label>
            <Select value={toBankId} onChange={(e) => setToBankId(e.target.value)} required>
              <option value="">Select destination bank...</option>
              {activeBanks
                .filter((bank) => bank.id !== fromBankId)
                .map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="Optional note for this transfer"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setTransferOpen(false);
                resetTransferForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={transferLoading} className="flex-1">
              Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
