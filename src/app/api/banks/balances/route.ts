import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";

export async function GET() {
  try {
    await requireSession();

    const [banks, paymentTotals, expenseTotals, transfersOut, transfersIn] = await Promise.all([
      prisma.bankAccount.findMany({ orderBy: { name: "asc" } }),
      prisma.payment.groupBy({
        by: ["bankAccountId"],
        where: { bankAccountId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.groupBy({
        by: ["bankAccountId"],
        where: { bankAccountId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.bankTransfer.groupBy({
        by: ["fromBankAccountId"],
        _sum: { amount: true },
      }),
      prisma.bankTransfer.groupBy({
        by: ["toBankAccountId"],
        _sum: { amount: true },
      }),
    ]);

    const totalsByBank = new Map(
      paymentTotals
        .filter((row) => row.bankAccountId)
        .map((row) => [
          row.bankAccountId as string,
          {
            balance: decimalToNumber(row._sum.amount),
            paymentCount: row._count.id,
          },
        ])
    );

    for (const row of expenseTotals) {
      if (!row.bankAccountId) continue;
      const stats = totalsByBank.get(row.bankAccountId) ?? { balance: 0, paymentCount: 0 };
      stats.balance -= decimalToNumber(row._sum.amount);
      totalsByBank.set(row.bankAccountId, stats);
    }

    for (const row of transfersOut) {
      if (!row.fromBankAccountId) continue;
      const stats = totalsByBank.get(row.fromBankAccountId) ?? { balance: 0, paymentCount: 0 };
      stats.balance -= decimalToNumber(row._sum.amount);
      totalsByBank.set(row.fromBankAccountId, stats);
    }

    for (const row of transfersIn) {
      if (!row.toBankAccountId) continue;
      const stats = totalsByBank.get(row.toBankAccountId) ?? { balance: 0, paymentCount: 0 };
      stats.balance += decimalToNumber(row._sum.amount);
      totalsByBank.set(row.toBankAccountId, stats);
    }

    const balances = banks.map((bank) => {
      const stats = totalsByBank.get(bank.id);
      return {
        id: bank.id,
        name: bank.name,
        isActive: bank.isActive,
        balance: stats?.balance ?? 0,
        paymentCount: stats?.paymentCount ?? 0,
      };
    });

    const totalBalance = balances.reduce((sum, bank) => sum + bank.balance, 0);

    return jsonResponse({ banks: balances, totalBalance });
  } catch (error) {
    return handleApiError(error);
  }
}
