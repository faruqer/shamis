import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
  return `Br ${formatted}`;
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function generateSaleNumber(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value.toString());
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  MOBILE_MONEY: "mBank",
  CHECK: "Check",
  OTHER: "Other",
};

export function formatPaymentMethod(method: string | null | undefined) {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method] ?? method.replace(/_/g, " ");
}

export function getSalePaymentMethods(
  payments:
    | {
        paymentMethod?: string | null;
        bankAccount?: { name: string } | null;
      }[]
    | undefined
) {
  if (!payments?.length) return null;
  const methods = [
    ...new Set(
      payments
        .map((p) => {
          if (p.paymentMethod === "BANK_TRANSFER" && p.bankAccount?.name) {
            return `Bank Transfer (${p.bankAccount.name})`;
          }
          return formatPaymentMethod(p.paymentMethod);
        })
        .filter((label): label is string => Boolean(label))
    ),
  ];
  return methods.length > 0 ? methods.join(", ") : null;
}
