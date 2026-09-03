import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  formatEthiopianDateLong,
  parseEthiopianDateInput,
} from "@/lib/ethiopian-calendar";
import { ensureSaleDateEthiopian } from "@/lib/sale-dates";

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

export function formatRmb(amount: number | string) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return `¥ ${formatted}`;
}

export function formatDate(date: Date | string) {
  return formatEthiopianDateLong(parseStoredDate(date));
}

export function formatGregorianDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseStoredDate(date));
}

export function formatDateTime(date: Date | string) {
  const stored = parseStoredDate(date);
  const eth = formatEthiopianDateLong(stored);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(stored);
  return `${eth} · ${time}`;
}

/** Format a stored Ethiopian date with the actual recorded time. */
export function formatSaleDateTime(
  saleDateEthiopian?: string | null,
  createdAt?: Date | string,
  saleDate?: Date | string
) {
  const storedSaleDate = saleDate ? parseStoredDate(saleDate) : undefined;
  const storedCreatedAt = createdAt ? parseStoredDate(createdAt) : undefined;
  const ethValue = saleDateEthiopian
    ? saleDateEthiopian
    : storedSaleDate
      ? ensureSaleDateEthiopian(storedSaleDate)
      : undefined;

  const dateLabel = ethValue
    ? formatEthiopianDateLong(parseEthiopianDateInput(ethValue))
    : formatEthiopianDateLong(storedSaleDate ?? storedCreatedAt ?? new Date());

  const timeSource = storedSaleDate ?? storedCreatedAt;
  if (!timeSource) return dateLabel;

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(timeSource);

  return `${dateLabel} · ${time}`;
}

/** Local calendar date as YYYY-MM-DD for `<input type="date">`. */
export function getLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as local midnight (not UTC). */
export function parseLocalDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Normalize stored ISO timestamps and date strings for local display/filtering. */
export function parseStoredDate(value: Date | string) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseLocalDateInput(value);
  }
  return new Date(value);
}

export function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isDateInLocalRange(value: Date | string, start: Date, end: Date) {
  const date = parseStoredDate(value);
  return date >= start && date <= end;
}

export function formatEthiopianDate(date: Date | string) {
  return formatEthiopianDateLong(parseStoredDate(date));
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
        amount?: string | number | { toString(): string } | null;
        bankAccount?: { name: string } | null;
      }[]
    | undefined
) {
  if (!payments?.length) return null;
  const labels = payments
    .map((p) => {
      const amountRaw = p.amount;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : amountRaw != null && typeof amountRaw === "object"
            ? parseFloat(amountRaw.toString()) || 0
            : parseFloat(String(amountRaw ?? "0")) || 0;
      let method =
        p.paymentMethod === "BANK_TRANSFER" && p.bankAccount?.name
          ? `Bank Transfer (${p.bankAccount.name})`
          : formatPaymentMethod(p.paymentMethod);
      if (!method) return null;
      if (payments.length > 1 && amount > 0) {
        method = `${method} ${formatCurrency(amount)}`;
      }
      return method;
    })
    .filter((label): label is string => Boolean(label));

  return labels.length > 0 ? [...new Set(labels)].join(", ") : null;
}
