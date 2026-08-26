"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentMethodFields } from "@/components/sales/payment-method-fields";
import { handoverToOwnerLabel, OWNER_NAME } from "@/lib/brand";
import { formatCurrency } from "@/lib/utils";

interface HandoverModalProps {
  open: boolean;
  onClose: () => void;
  owedToOwner: number;
  onSuccess: () => void;
}

export function HandoverModal({ open, onClose, owedToOwner, onSuccess }: HandoverModalProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaymentMethod("");
    setBankAccountId("");
    setNotes("");
    setAmount(owedToOwner > 0 ? String(owedToOwner) : "");
  }, [open, owedToOwner]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const handoverAmount = parseFloat(amount);
    if (!handoverAmount || handoverAmount <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (handoverAmount > owedToOwner + 0.001) {
      setError(`Amount cannot exceed ${formatCurrency(owedToOwner)} owed to ${OWNER_NAME}`);
      return;
    }
    if (!paymentMethod) {
      setError("Select how you sent the money");
      return;
    }
    if (paymentMethod === "BANK_TRANSFER" && !bankAccountId) {
      setError("Select a bank for bank transfer");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/balance/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: handoverAmount,
          paymentMethod,
          bankAccountId: bankAccountId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to record handover");

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record handover");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={handoverToOwnerLabel()}
      description={
        owedToOwner > 0
          ? `Record money you sent to ${OWNER_NAME}. Current balance: ${formatCurrency(owedToOwner)}`
          : `You have nothing owed to ${OWNER_NAME} right now.`
      }
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
        <div className="space-y-2">
          <Label className="text-sm">Amount sent *</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={owedToOwner > 0 ? owedToOwner : undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount handed over"
            required
            disabled={owedToOwner <= 0}
          />
          {owedToOwner > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(owedToOwner))}
              className="text-xs text-primary hover:underline"
            >
              Use full balance ({formatCurrency(owedToOwner)})
            </button>
          )}
        </div>

        <PaymentMethodFields
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          bankAccountId={bankAccountId}
          onBankAccountChange={setBankAccountId}
        />

        <div className="space-y-2">
          <Label className="text-sm">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional reference or note"
            disabled={owedToOwner <= 0}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting || owedToOwner <= 0}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Confirm Handover"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
