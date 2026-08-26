import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { buildClientCreditData } from "@/lib/client-credit";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== Role.ADMIN) {
      throw new Error("Forbidden");
    }

    const { clientCredit, clientBalances, creditSales, clientHistory } =
      await buildClientCreditData();

    const creditHistory = clientHistory.sort(
      (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    );

    return jsonResponse({
      clientCredit,
      clientBalances,
      creditSales,
      creditHistory,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
