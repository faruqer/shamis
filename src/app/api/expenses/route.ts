import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { ExpenseCategory, LedgerType } from "@prisma/client";
import { isSalesperson } from "@/lib/shop-scope";
import { resolveBankAccountId } from "@/lib/banks";
import { z } from "zod";

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  notes: z.string().optional(),
  bankAccountId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const where = {
      ...(category ? { category: category as ExpenseCategory } : {}),
      ...(isSalesperson(session) ? { paidById: session.id } : {}),
    };

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        paidBy: { select: { name: true } },
        bankAccount: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: "desc" },
    });

    return jsonResponse(expenses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const data = expenseSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const bankAccountId = await resolveBankAccountId(tx, data.bankAccountId);

      const expense = await tx.expense.create({
        data: {
          category: isSalesperson(session) ? ExpenseCategory.SHOP : ExpenseCategory.OTHER,
          description: data.description,
          amount: data.amount,
          expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
          notes: data.notes,
          paidById: isSalesperson(session) ? session.id : null,
          bankAccountId,
        },
        include: {
          bankAccount: { select: { id: true, name: true } },
        },
      });

      if (isSalesperson(session)) {
        await tx.salespersonLedger.create({
          data: {
            userId: session.id,
            type: LedgerType.EXPENSE,
            amount: -data.amount,
            description: `Expense: ${data.description}`,
            expenseId: expense.id,
          },
        });
      }

      return expense;
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
