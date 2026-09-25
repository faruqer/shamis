import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { buildClientCreditData } from "@/lib/client-credit";
import { LEDGER_ENTRY_INCLUDE, shapeLedgerEntry } from "@/lib/ledger-entry";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";

export async function GET() {
  try {
    const session = await requireSession();

    if (!isSalesperson(session)) {
      throw new Error("Forbidden");
    }

    const shopId = requireSalespersonShopId(session);

    const [ledgerEntries, clientData] = await Promise.all([
      prisma.salespersonLedger.findMany({
        where: { userId: session.id },
        include: LEDGER_ENTRY_INCLUDE,
        orderBy: { entryDate: "desc" },
      }),
      buildClientCreditData({ shopId, saleTypes: ["RETAIL"] }),
    ]);

    const ownerCredit = ledgerEntries.reduce(
      (sum, entry) => sum + decimalToNumber(entry.amount),
      0
    );

    const creditHistory = [
      ...ledgerEntries.map((entry) => ({
        id: entry.id,
        category: "OWNER" as const,
        type: entry.type,
        amount: decimalToNumber(entry.amount),
        description: entry.description,
        entryDate: entry.entryDate,
        reference: entry.sale?.saleNumber,
        clientName: undefined as string | undefined,
        productNames: undefined as string | undefined,
      })),
      ...clientData.clientHistory,
    ].sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());

    return jsonResponse({
      shopName: session.shopName,
      ownerCredit,
      clientCredit: clientData.clientCredit,
      totalCredit: ownerCredit + clientData.clientCredit,
      owedToOwner: ownerCredit,
      clientsOweYou: clientData.clientCredit,
      clientBalances: clientData.clientBalances,
      creditSales: clientData.creditSales,
      // The salesperson's own credit-to-owner ledger, with the sale behind each
      // row, for the Balance page's owner-credit tab.
      ownerEntries: ledgerEntries.map(shapeLedgerEntry),
      ledgerEntries: ledgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: decimalToNumber(entry.amount),
        description: entry.description,
        entryDate: entry.entryDate,
        saleNumber: entry.sale?.saleNumber,
        expenseDescription: entry.expense?.description,
      })),
      creditHistory,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
