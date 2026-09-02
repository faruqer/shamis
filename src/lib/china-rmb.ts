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
