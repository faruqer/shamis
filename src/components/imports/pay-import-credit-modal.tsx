"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";

interface CreditPerson {
  id: string;
  name: string;
  amount: string;
  paidAmount?: string;
}

function parseAmount(value: string | number | undefined) {
  return parseFloat(String(value ?? 0)) || 0;
}

function getPersonOutstanding(person: CreditPerson) {
  return Math.max(0, parseAmount(person.amount) - parseAmount(person.paidAmount));
}

function isPersonPaid(person: CreditPerson, importFullyPaid: boolean) {
  const outstanding = getPersonOutstanding(person);
  if (outstanding <= 0.001) return true;
  return importFullyPaid && parseAmount(person.paidAmount) === 0;
}

interface PayImportCreditModalProps {
  open: boolean;
  onClose: () => void;
  importRecord: {
    id: string;
    batchNumber: string;
    creditAmount: string;
    creditPaidAmount: string;
    creditPaid: boolean;
    creditPersons?: CreditPerson[];
  };
  onPaid: (updated: unknown) => void;
}

export function PayImportCreditModal({
  open,
  onClose,
  importRecord,
  onPaid,
}: PayImportCreditModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const persons = importRecord.creditPersons ?? [];

  const personsWithStatus = useMemo(
    () =>
      persons.map((person) => {
        const paid = isPersonPaid(person, importRecord.creditPaid);
        const outstanding = paid ? 0 : getPersonOutstanding(person);
        return { ...person, paid, outstanding };
      }),
    [persons, importRecord.creditPaid]
  );

  const pendingPersons = personsWithStatus.filter((person) => !person.paid);
  const totalOutstanding = pendingPersons.reduce((sum, person) => sum + person.outstanding, 0);

  const paymentAmount = useMemo(
    () =>
      personsWithStatus
        .filter((person) => selectedIds.includes(person.id))
        .reduce((sum, person) => sum + person.outstanding, 0),
    [personsWithStatus, selectedIds]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setSelectedIds([]);
  }, [open, importRecord.id]);

  function togglePerson(personId: string) {
    const person = personsWithStatus.find((entry) => entry.id === personId);
    if (!person || person.paid) return;

    setSelectedIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (selectedIds.length === 0) {
      setError("Select at least one person to pay");
      return;
    }
    if (paymentAmount <= 0) {
      setError("Selected persons have no outstanding balance");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/imports/${importRecord.id}/pay-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record credit payment");
      onPaid(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record credit payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay import credit"
      description={`Batch ${importRecord.batchNumber} · ${formatCurrency(totalOutstanding)} remaining`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Select who to pay</Label>
          {personsWithStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit persons recorded for this import.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {personsWithStatus.map((person) => (
                <label
                  key={person.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    person.paid ? "bg-muted/30" : "cursor-pointer hover:bg-muted/40",
                    !person.paid && selectedIds.includes(person.id) && "bg-primary/5"
                  )}
                >
                  {!person.paid ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(person.id)}
                      onChange={() => togglePerson(person.id)}
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(person.amount)} credit
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {person.paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Paid
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                        <p className="mt-1 text-sm font-semibold tabular-nums">
                          {formatCurrency(person.outstanding)}
                        </p>
                      </>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Payment amount</Label>
          <Input
            readOnly
            value={paymentAmount > 0 ? paymentAmount.toFixed(2) : ""}
            placeholder="Select persons above"
            className="bg-muted font-semibold tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Total updates automatically based on selected pending persons.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={selectedIds.length === 0 || paymentAmount <= 0}>
            Record payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
