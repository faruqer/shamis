import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { Role } from "@prisma/client";
import { getBankMovements } from "@/lib/bank-balance";

const bankUpdateSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  /**
   * The balance the account should now show. Recorded movements are never
   * rewritten — the difference is absorbed by the bank's opening balance.
   */
  balance: z.number().finite().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await request.json();
    const data = bankUpdateSchema.parse(body);

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) return errorResponse("Bank not found", 404);

    // Correcting a balance rewrites what the books say the business holds, so
    // only an admin may do it. Renaming stays open to salespersons as before.
    if (data.balance !== undefined && session.role !== Role.ADMIN) {
      return errorResponse("Only an admin can change a bank balance", 403);
    }

    let openingBalance: number | undefined;
    if (data.balance !== undefined) {
      const movements = await getBankMovements(id);
      openingBalance = data.balance - movements;
    }

    const bank = await prisma.bankAccount.update({
      where: { id },
      data: {
        name: data.name.trim(),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(openingBalance !== undefined ? { openingBalance } : {}),
      },
    });

    return jsonResponse({ ...bank, openingBalance: decimalToNumber(bank.openingBalance) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) return errorResponse("Bank not found", 404);

    if (existing._count.payments > 0) {
      await prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
      return jsonResponse({ success: true, deactivated: true });
    }

    await prisma.bankAccount.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
