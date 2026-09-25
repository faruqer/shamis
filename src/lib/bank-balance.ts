import prisma from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

/**
 * Net effect of recorded movements on one bank account: payments in, expenses
 * out, transfers both ways. Excludes the account's opening balance, so a shown
 * balance is always `openingBalance + getBankMovements(id)`.
 */
export async function getBankMovements(bankAccountId: string) {
  const [payments, expenses, transfersOut, transfersIn] = await Promise.all([
    prisma.payment.aggregate({
      where: { bankAccountId },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { bankAccountId },
      _sum: { amount: true },
    }),
    prisma.bankTransfer.aggregate({
      where: { fromBankAccountId: bankAccountId },
      _sum: { amount: true },
    }),
    prisma.bankTransfer.aggregate({
      where: { toBankAccountId: bankAccountId },
      _sum: { amount: true },
    }),
  ]);

  return (
    decimalToNumber(payments._sum.amount) -
    decimalToNumber(expenses._sum.amount) -
    decimalToNumber(transfersOut._sum.amount) +
    decimalToNumber(transfersIn._sum.amount)
  );
}
