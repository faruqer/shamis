"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  Users,
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
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Role } from "@prisma/client";

interface HawalaReceiver {
  id: string;
  salespersonId: string;
  name: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  salesperson: { id: string; name: string };
}

interface HawalaTransfer {
  id: string;
  salespersonId: string;
  receiverId: string;
  amount: number;
  notes: string | null;
  transferDate: string;
  status: "PENDING" | "CONFIRMED";
  confirmedAt: string | null;
  salesperson: { id: string; name: string };
  receiver: { id: string; name: string; phone: string | null };
  confirmedBy: { id: string; name: string } | null;
}

interface Salesperson {
  id: string;
  name: string;
}

type AdminTab = "transfers" | "receivers";

export function HawalaClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const isAdmin = user.role === Role.ADMIN;

  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<HawalaTransfer[]>([]);
  const [receivers, setReceivers] = useState<HawalaReceiver[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [adminTab, setAdminTab] = useState<AdminTab>("transfers");
  const [filterSalesperson, setFilterSalesperson] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReceiverModal, setShowReceiverModal] = useState(false);
  const [editingReceiver, setEditingReceiver] = useState<HawalaReceiver | null>(null);

  const [transferReceiverId, setTransferReceiverId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const [receiverSalespersonId, setReceiverSalespersonId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverNotes, setReceiverNotes] = useState("");
  const [receiverSubmitting, setReceiverSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const activeReceivers = useMemo(
    () => receivers.filter((r) => r.isActive),
    [receivers]
  );

  const myReceivers = useMemo(
    () => activeReceivers.filter((r) => !filterSalesperson || r.salespersonId === filterSalesperson),
    [activeReceivers, filterSalesperson]
  );

  const stats = useMemo(() => {
    const pending = transfers.filter((t) => t.status === "PENDING");
    const confirmed = transfers.filter((t) => t.status === "CONFIRMED");
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, t) => s + t.amount, 0),
      confirmedAmount: confirmed.reduce((s, t) => s + t.amount, 0),
      totalAmount: transfers.reduce((s, t) => s + t.amount, 0),
    };
  }, [transfers]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const transferParams = new URLSearchParams();
      if (filterSalesperson) transferParams.set("salespersonId", filterSalesperson);
      if (filterStatus) transferParams.set("status", filterStatus);

      const receiverParams = new URLSearchParams();
      if (filterSalesperson) receiverParams.set("salespersonId", filterSalesperson);

      const requests: Promise<Response>[] = [
        fetch(`/api/hawala/transfers?${transferParams}`),
        fetch(`/api/hawala/receivers?${receiverParams}`),
      ];
      if (isAdmin) {
        requests.push(fetch("/api/salespersons"));
      }

      const results = await Promise.all(requests);
      for (const res of results) {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load hawala data");
        }
      }

      const [transfersData, receiversData, salespersonsData] = await Promise.all(
        results.map((r) => r.json())
      );
      setTransfers(transfersData);
      setReceivers(receiversData);
      if (isAdmin && salespersonsData) setSalespersons(salespersonsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hawala data");
    } finally {
      setLoading(false);
    }
  }, [filterSalesperson, filterStatus, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetTransferForm() {
    setTransferReceiverId("");
    setTransferAmount("");
    setTransferNotes("");
    setError(null);
  }

  function resetReceiverForm() {
    setReceiverSalespersonId(filterSalesperson || "");
    setReceiverName("");
    setReceiverPhone("");
    setReceiverNotes("");
    setEditingReceiver(null);
    setError(null);
  }

  function openAddReceiver() {
    resetReceiverForm();
    setShowReceiverModal(true);
  }

  function openEditReceiver(receiver: HawalaReceiver) {
    setEditingReceiver(receiver);
    setReceiverSalespersonId(receiver.salespersonId);
    setReceiverName(receiver.name);
    setReceiverPhone(receiver.phone || "");
    setReceiverNotes(receiver.notes || "");
    setShowReceiverModal(true);
  }

  async function handleCreateTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!transferReceiverId) {
      setError("Select a receiver");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setTransferSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/hawala/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: transferReceiverId,
          amount,
          notes: transferNotes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create transfer");

      setShowTransferModal(false);
      resetTransferForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setTransferSubmitting(false);
    }
  }

  async function handleSaveReceiver(e: React.FormEvent) {
    e.preventDefault();
    if (!receiverName.trim()) {
      setError("Receiver name is required");
      return;
    }
    if (!editingReceiver && !receiverSalespersonId) {
      setError("Select a salesperson");
      return;
    }

    setReceiverSubmitting(true);
    setError(null);
    try {
      const url = editingReceiver
        ? `/api/hawala/receivers/${editingReceiver.id}`
        : "/api/hawala/receivers";
      const method = editingReceiver ? "PATCH" : "POST";
      const payload = editingReceiver
        ? {
            name: receiverName.trim(),
            phone: receiverPhone.trim() || null,
            notes: receiverNotes.trim() || null,
          }
        : {
            salespersonId: receiverSalespersonId,
            name: receiverName.trim(),
            phone: receiverPhone.trim() || undefined,
            notes: receiverNotes.trim() || undefined,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to save receiver");

      setShowReceiverModal(false);
      resetReceiverForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save receiver");
    } finally {
      setReceiverSubmitting(false);
    }
  }

  async function handleDeactivateReceiver(id: string) {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/hawala/receivers/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to remove receiver");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove receiver");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleConfirmTransfer(id: string) {
    setConfirmingId(id);
    try {
      const res = await fetch(`/api/hawala/transfers/${id}/confirm`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to confirm transfer");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm transfer");
    } finally {
      setConfirmingId(null);
    }
  }

  const transferList = (
    <div className="space-y-4">
      {transfers.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-8 w-8" />}
          title="No transfers yet"
          description={
            isAdmin
              ? "Money transfers from salespersons will appear here"
              : "Send money to an assigned receiver to get started"
          }
        />
      ) : (
        transfers.map((transfer, index) => (
          <motion.div
            key={transfer.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{formatCurrency(transfer.amount)}</p>
                <Badge variant={transfer.status === "CONFIRMED" ? "success" : "warning"}>
                  {transfer.status === "CONFIRMED" ? "Confirmed" : "Pending"}
                </Badge>
              </div>
              <p className="text-sm">
                To <span className="font-medium">{transfer.receiver.name}</span>
                {transfer.receiver.phone && (
                  <span className="text-muted-foreground"> · {transfer.receiver.phone}</span>
                )}
              </p>
              {isAdmin && (
                <p className="text-sm text-muted-foreground">
                  From {transfer.salesperson.name}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDateTime(transfer.transferDate)}
                {transfer.notes && ` · ${transfer.notes}`}
              </p>
              {transfer.status === "CONFIRMED" && transfer.confirmedAt && (
                <p className="text-xs text-success">
                  Confirmed {formatDateTime(transfer.confirmedAt)}
                  {transfer.confirmedBy && ` by ${transfer.confirmedBy.name}`}
                </p>
              )}
            </div>
            {isAdmin && transfer.status === "PENDING" && (
              <Button
                size="sm"
                onClick={() => handleConfirmTransfer(transfer.id)}
                disabled={confirmingId === transfer.id}
              >
                {confirmingId === transfer.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm Received
              </Button>
            )}
          </motion.div>
        ))
      )}
    </div>
  );

  const receiverList = (
    <div className="space-y-4">
      {myReceivers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No receivers assigned"
          description={
            isAdmin
              ? "Add receiving persons for a salesperson"
              : "Ask admin to assign receiving persons for you"
          }
        />
      ) : (
        myReceivers.map((receiver, index) => (
          <motion.div
            key={receiver.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{receiver.name}</p>
              {receiver.phone && (
                <p className="text-sm text-muted-foreground">{receiver.phone}</p>
              )}
              {isAdmin && (
                <p className="text-sm text-muted-foreground">
                  Salesperson: {receiver.salesperson.name}
                </p>
              )}
              {receiver.notes && (
                <p className="text-xs text-muted-foreground mt-1">{receiver.notes}</p>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditReceiver(receiver)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeactivateReceiver(receiver.id)}
                  disabled={actionLoadingId === receiver.id}
                >
                  {actionLoadingId === receiver.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove
                </Button>
              </div>
            )}
          </motion.div>
        ))
      )}
    </div>
  );

  return (
    <DashboardLayout
      user={user}
      title="Hawala"
      description={
        isAdmin
          ? "Track money transfers, confirm receipts, and manage receiving persons"
          : "Send money to receiving persons assigned by admin"
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Transfers"
          value={String(stats.pendingCount)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Amount"
          value={formatCurrency(stats.pendingAmount)}
          icon={<Send className="h-5 w-5" />}
        />
        <StatCard
          title="Confirmed Amount"
          value={formatCurrency(stats.confirmedAmount)}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Assigned Receivers"
          value={String(activeReceivers.length)}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {isAdmin && (
          <>
            <Select
              value={filterSalesperson}
              onChange={(e) => setFilterSalesperson(e.target.value)}
              className="w-52"
            >
              <option value="">All salespersons</option>
              {salespersons.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </Select>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-40"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
            </Select>
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!isAdmin && (
            <Button
              onClick={() => {
                resetTransferForm();
                setShowTransferModal(true);
              }}
              disabled={activeReceivers.length === 0}
            >
              <Send className="h-4 w-4" />
              New Transfer
            </Button>
          )}
          {isAdmin && adminTab === "receivers" && (
            <Button onClick={openAddReceiver}>
              <UserPlus className="h-4 w-4" />
              Add Receiver
            </Button>
          )}
        </div>
      </div>

      {error && !showTransferModal && !showReceiverModal && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : isAdmin ? (
        <>
          <div className="mb-4 flex gap-2">
            <Button
              variant={adminTab === "transfers" ? "primary" : "outline"}
              size="sm"
              onClick={() => setAdminTab("transfers")}
            >
              Transfers
            </Button>
            <Button
              variant={adminTab === "receivers" ? "primary" : "outline"}
              size="sm"
              onClick={() => setAdminTab("receivers")}
            >
              Receivers
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{adminTab === "transfers" ? "Money Transfers" : "Receiving Persons"}</CardTitle>
            </CardHeader>
            <CardContent>{adminTab === "transfers" ? transferList : receiverList}</CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>My Receivers</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  resetTransferForm();
                  setShowTransferModal(true);
                }}
                disabled={activeReceivers.length === 0}
              >
                <Send className="h-4 w-4" />
                Send
              </Button>
            </CardHeader>
            <CardContent>{receiverList}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Transfer History</CardTitle>
            </CardHeader>
            <CardContent>{transferList}</CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="New Hawala Transfer"
        description="Send money to an assigned receiving person"
        className="max-w-md"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4 px-6 py-4">
          <div className="space-y-2">
            <Label>Receiver *</Label>
            <Select
              value={transferReceiverId}
              onChange={(e) => setTransferReceiverId(e.target.value)}
              required
            >
              <option value="">Select receiver</option>
              {activeReceivers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.phone ? ` (${r.phone})` : ""}
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
              placeholder="Amount to send"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="Optional reference"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowTransferModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={transferSubmitting}>
              {transferSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Transfer"
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showReceiverModal}
        onClose={() => setShowReceiverModal(false)}
        title={editingReceiver ? "Edit Receiver" : "Add Receiver"}
        description="Assign a receiving person to a salesperson"
        className="max-w-md"
      >
        <form onSubmit={handleSaveReceiver} className="space-y-4 px-6 py-4">
          {!editingReceiver && (
            <div className="space-y-2">
              <Label>Salesperson *</Label>
              <Select
                value={receiverSalespersonId}
                onChange={(e) => setReceiverSalespersonId(e.target.value)}
                required
              >
                <option value="">Select salesperson</option>
                {salespersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="Receiver full name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              placeholder="Phone number"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={receiverNotes}
              onChange={(e) => setReceiverNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowReceiverModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={receiverSubmitting}>
              {receiverSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Receiver"
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
