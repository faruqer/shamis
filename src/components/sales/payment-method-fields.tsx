"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { OWNER_NAME } from "@/lib/brand";

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MOBILE_MONEY", label: "mBank" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
] as const;

interface BankRecord {
  id: string;
  name: string;
  isActive: boolean;
}

interface PaymentMethodFieldsProps {
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  bankAccountId: string;
  onBankAccountChange: (value: string) => void;
}

export function PaymentMethodFields({
  paymentMethod,
  onPaymentMethodChange,
  bankAccountId,
  onBankAccountChange,
}: PaymentMethodFieldsProps) {
  const [banks, setBanks] = useState<BankRecord[]>([]);

  useEffect(() => {
    fetch("/api/banks")
      .then((r) => r.json())
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  const activeBanks = banks.filter((b) => b.isActive);

  function handleMethodChange(value: string) {
    onPaymentMethodChange(value);
    if (value !== "BANK_TRANSFER") {
      onBankAccountChange("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">Payment Method *</Label>
        <Select value={paymentMethod} onChange={(e) => handleMethodChange(e.target.value)} required>
          <option value="">Select method...</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>

      {paymentMethod === "BANK_TRANSFER" && (
        <div className="space-y-2">
          <Label className="text-sm">Bank *</Label>
          <Select
            value={bankAccountId}
            onChange={(e) => onBankAccountChange(e.target.value)}
            required
          >
            <option value="">Select bank...</option>
            {activeBanks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </Select>
          {activeBanks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No banks configured. Ask {OWNER_NAME} to add banks in Shops &amp; Users.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
