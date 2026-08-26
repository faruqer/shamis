import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { LedgerType, Prisma } from "@prisma/client";
import { isSalesperson } from "@/lib/shop-scope";
import { resolveBankAccountId } from "@/lib/banks";

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  notes: z.string().optional(),
  bankAccountId: z.string().min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

async function getAuthorizedExpense(session: Awaited<ReturnType<typeof requireSession>>, id: string) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      paidBy: { select: { id: true, name: true } },
      bankAccount: { select: { id: true, name: true } },
    },
  });

  if (!expense) {
    throw new Error("Expense not found");
  }

  if (isSalesperson(session) && expense.paidById !== session.id) {
    throw new Error("You can only modify your own expenses");
  }

  return expense;
}

async function syncExpenseLedger(
  tx: Prisma.TransactionClient,
  expenseId: string,
  amount: number,
  description: string,
  paidById: string | null
) {
  const existing = await tx.salespersonLedger.findUnique({ where: { expenseId } });

  if (paidById) {
    const ledgerData = {
      userId: paidById,
      type: LedgerType.EXPENSE,
      amount: -amount,
      description: `Expense: ${description}`,
    };

    if (existing) {
      await tx.salespersonLedger.update({
        where: { id: existing.id },
        data: ledgerData,
      });
    } else {
      await tx.salespersonLedger.create({
        data: { ...ledgerData, expenseId },
      });
    }
    return;
  }

  if (existing) {
    await tx.salespersonLedger.delete({ where: { id: existing.id } });
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const expense = await getAuthorizedExpense(session, id);
    return jsonResponse(expense);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await request.json();
    const existing = await getAuthorizedExpense(session, id);
    const data = expenseSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const bankAccountId = await resolveBankAccountId(tx, data.bankAccountId);

      const expense = await tx.expense.update({
        where: { id },
        data: {
          description: data.description,
          amount: data.amount,
          expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined,
          notes: data.notes,
          bankAccountId,
        },
      });

      if (isSalesperson(session)) {
        await syncExpenseLedger(tx, id, data.amount, data.description, session.id);
      } else if (existing.paidById) {
        await syncExpenseLedger(tx, id, data.amount, data.description, existing.paidById);
      }

      return expense;
    });

    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    await getAuthorizedExpense(session, id);

    await prisma.$transaction(async (tx) => {
      await tx.salespersonLedger.deleteMany({ where: { expenseId: id } });
      await tx.expense.delete({ where: { id } });
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
