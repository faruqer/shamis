import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { LEDGER_ENTRY_INCLUDE, shapeLedgerEntry } from "@/lib/ledger-entry";
import { Role } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const targetUserId =
      session.role === Role.ADMIN && userId ? userId : session.id;

    const entries = await prisma.salespersonLedger.findMany({
      where: { userId: targetUserId },
      include: LEDGER_ENTRY_INCLUDE,
      orderBy: { entryDate: "desc" },
    });

    const balance = entries.reduce(
      (sum, entry) => sum + decimalToNumber(entry.amount),
      0
    );

    const users =
      session.role === Role.ADMIN
        ? await prisma.user.findMany({
            where: { role: Role.SALESPERSON, isActive: true },
            select: { id: true, name: true, email: true },
          })
        : [];

    const salespersonBalances = session.role === Role.ADMIN
      ? await Promise.all(
          users.map(async (user) => {
            const userEntries = await prisma.salespersonLedger.findMany({
              where: { userId: user.id },
            });
            const userBalance = userEntries.reduce(
              (sum, e) => sum + decimalToNumber(e.amount),
              0
            );
            return { ...user, balance: userBalance };
          })
        )
      : [];

    return jsonResponse({
      entries: entries.map(shapeLedgerEntry),
      balance,
      users,
      salespersonBalances,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
