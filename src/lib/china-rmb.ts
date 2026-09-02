import { Prisma } from "@prisma/client";

export function parseRmbAmount(value: Prisma.Decimal | number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseFloat(value) || 0;
  return Number(value ?? 0) || 0;
}

export function creditOutstanding(amount: number, paidAmount: number) {
  return Math.max(0, amount - paidAmount);
}

export function isCreditSettled(amount: number, paidAmount: number) {
  return creditOutstanding(amount, paidAmount) <= 0.001;
}

export function getCreditStatus(amount: number, paidAmount: number) {
  if (paidAmount <= 0) return "OPEN" as const;
  if (isCreditSettled(amount, paidAmount)) return "SETTLED" as const;
  return "PARTIAL" as const;
}

export function summarizeCredits(
  credits: { amount: Prisma.Decimal | number; paidAmount?: Prisma.Decimal | number | null }[]
) {
  const totalCredit = credits.reduce((sum, credit) => sum + parseRmbAmount(credit.amount), 0);
  const totalPaid = credits.reduce((sum, credit) => sum + parseRmbAmount(credit.paidAmount), 0);
  return {
    totalCredit,
    totalPaid,
    outstanding: Math.max(0, totalCredit - totalPaid),
    count: credits.length,
  };
}

export function validateCreditPayment(amount: number, paidAmount: number, payment: number) {
  const outstanding = creditOutstanding(amount, paidAmount);
  if (payment <= 0) throw new Error("Payment amount must be greater than zero");
  if (payment > outstanding + 0.001) {
    throw new Error(`Payment cannot exceed outstanding balance (${outstanding})`);
  }
}

export function nextPaidAmount(paidAmount: number, payment: number) {
  return parseRmbAmount(paidAmount) + payment;
}
