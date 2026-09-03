"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CASH_AND_BANK", label: "Cash + Bank" },
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
  cashAmount?: string;
  onCashAmountChange?: (value: string) => void;
  bankAmount?: string;
  onBankAmountChange?: (value: string) => void;
  expectedTotal?: number;
}

export function PaymentMethodFields({
  paymentMethod,
  onPaymentMethodChange,
  bankAccountId,
  onBankAccountChange,
  cashAmount = "",
  onCashAmountChange,
  bankAmount = "",
  onBankAmountChange,
  expectedTotal,
}: PaymentMethodFieldsProps) {
  const [banks, setBanks] = useState<BankRecord[]>([]);

  useEffect(() => {
    fetch("/api/banks")
      .then((r) => r.json())
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  const activeBanks = banks.filter((b) => b.isActive);
  const isSplit = paymentMethod === "CASH_AND_BANK";
  const splitTotal =
    (parseFloat(cashAmount) || 0) + (parseFloat(bankAmount) || 0);
  const splitMismatch =
    isSplit &&
    expectedTotal != null &&
    expectedTotal > 0 &&
    Math.abs(splitTotal - expectedTotal) > 0.009;

  function handleMethodChange(value: string) {
    onPaymentMethodChange(value);
    if (value !== "BANK_TRANSFER" && value !== "CASH_AND_BANK") {
      onBankAccountChange("");
    }
    if (value !== "CASH_AND_BANK") {
      onCashAmountChange?.("");
      onBankAmountChange?.("");
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

      {isSplit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm">Cash Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={cashAmount}
              onChange={(e) => onCashAmountChange?.(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Bank Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={bankAmount}
              onChange={(e) => onBankAmountChange?.(e.target.value)}
              required
            />
          </div>
          {expectedTotal != null && expectedTotal > 0 && (
            <p
              className={`sm:col-span-2 text-xs ${splitMismatch ? "text-destructive" : "text-muted-foreground"}`}
            >
              {splitMismatch
                ? `Cash + bank must equal ${formatCurrency(expectedTotal)} (currently ${formatCurrency(splitTotal)})`
                : `Total paid: ${formatCurrency(splitTotal)} of ${formatCurrency(expectedTotal)}`}
            </p>
          )}
        </div>
      )}

      {(paymentMethod === "BANK_TRANSFER" || isSplit) && (
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

export function buildPaymentPayload(options: {
  paymentMethod: string;
  paidAmount: number;
  bankAccountId?: string;
  cashAmount?: string;
  bankAmount?: string;
}) {
  if (options.paymentMethod === "CASH_AND_BANK") {
    const cash = parseFloat(options.cashAmount ?? "") || 0;
    const bank = parseFloat(options.bankAmount ?? "") || 0;
    if (cash <= 0 || bank <= 0) {
      throw new Error("Enter both cash and bank amounts");
    }
    if (Math.abs(cash + bank - options.paidAmount) > 0.009) {
      throw new Error("Cash and bank amounts must add up to the amount paid");
    }
    if (!options.bankAccountId) {
      throw new Error("Select a bank for the bank portion");
    }
    return {
      paymentSplits: [
        { paymentMethod: "CASH" as const, amount: cash },
        {
          paymentMethod: "BANK_TRANSFER" as const,
          amount: bank,
          bankAccountId: options.bankAccountId,
        },
      ],
    };
  }

  if (!options.paymentMethod) {
    throw new Error("Payment method is required");
  }

  return {
    paymentMethod: options.paymentMethod,
    bankAccountId:
      options.paymentMethod === "BANK_TRANSFER" ? options.bankAccountId : undefined,
  };
}

export function detectSplitPaymentMethod(
  payments: { paymentMethod?: string | null; amount?: number | string }[] | undefined
) {
  if (!payments || payments.length !== 2) return null;
  const methods = payments.map((p) => p.paymentMethod);
  if (methods.includes("CASH") && methods.includes("BANK_TRANSFER")) {
    return "CASH_AND_BANK";
  }
  return null;
}
