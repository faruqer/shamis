import { ChinaRmbEntryType, Prisma } from "@prisma/client";

export function signedRmbAmount(type: ChinaRmbEntryType, amount: Prisma.Decimal | number) {
  const value = typeof amount === "number" ? amount : Number(amount);
  return type === ChinaRmbEntryType.CREDIT ? value : -value;
}

export function computeChinaRmbBalance(
  entries: { type: ChinaRmbEntryType; amount: Prisma.Decimal | number }[]
) {
  return entries.reduce((sum, entry) => sum + signedRmbAmount(entry.type, entry.amount), 0);
}

export function computeChinaRmbTotals(
  entries: { type: ChinaRmbEntryType; amount: Prisma.Decimal | number }[]
) {
  return entries.reduce(
    (totals, entry) => {
      const value = Number(entry.amount);
      if (entry.type === ChinaRmbEntryType.CREDIT) {
        totals.totalCredit += value;
      } else {
        totals.totalDebit += value;
      }
      return totals;
    },
    { totalCredit: 0, totalDebit: 0 }
  );
}

export function computeChinaRmbOutstanding(
  entries: { amount: Prisma.Decimal | number; paidAmount?: Prisma.Decimal | number | null }[]
) {
  return entries.reduce((sum, entry) => {
    const amount = Number(entry.amount);
    const paid = Number(entry.paidAmount ?? 0);
    return sum + Math.max(0, amount - paid);
  }, 0);
}

export function getChinaRmbPaymentStatus(amount: number, paidAmount: number) {
  if (paidAmount <= 0) return "UNPAID" as const;
  if (paidAmount >= amount - 0.001) return "PAID" as const;
  return "PARTIAL" as const;
}
