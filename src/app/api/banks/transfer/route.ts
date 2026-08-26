import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { resolveBankAccountId } from "@/lib/banks";
import { decimalToNumber } from "@/lib/utils";

const transferSchema = z.object({
  fromBankAccountId: z.string().min(1),
  toBankAccountId: z.string().min(1),
  amount: z.number().positive(),
  transferDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await request.json();
    const data = transferSchema.parse(body);

    if (data.fromBankAccountId === data.toBankAccountId) {
      return errorResponse("Choose two different bank accounts", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const fromBankId = await resolveBankAccountId(tx, data.fromBankAccountId);
      const toBankId = await resolveBankAccountId(tx, data.toBankAccountId);

      const [paymentTotals, expenseTotals, transfersOut, transfersIn] = await Promise.all([
        tx.payment.groupBy({
          by: ["bankAccountId"],
          where: { bankAccountId: fromBankId },
          _sum: { amount: true },
        }),
        tx.expense.groupBy({
          by: ["bankAccountId"],
          where: { bankAccountId: fromBankId },
          _sum: { amount: true },
        }),
        tx.bankTransfer.groupBy({
          by: ["fromBankAccountId"],
          where: { fromBankAccountId: fromBankId },
          _sum: { amount: true },
        }),
        tx.bankTransfer.groupBy({
          by: ["toBankAccountId"],
          where: { toBankAccountId: fromBankId },
          _sum: { amount: true },
        }),
      ]);

      const paymentsIn = decimalToNumber(paymentTotals[0]?._sum.amount);
      const expensesOut = decimalToNumber(expenseTotals[0]?._sum.amount);
      const sentOut = decimalToNumber(transfersOut[0]?._sum.amount);
      const receivedIn = decimalToNumber(transfersIn[0]?._sum.amount);
      const available = paymentsIn - expensesOut - sentOut + receivedIn;

      if (available + 0.001 < data.amount) {
        throw new Error("Insufficient balance in the source bank account");
      }

      return tx.bankTransfer.create({
        data: {
          fromBankAccountId: fromBankId,
          toBankAccountId: toBankId,
          amount: data.amount,
          transferDate: data.transferDate ? new Date(data.transferDate) : new Date(),
          notes: data.notes,
        },
        include: {
          fromBank: { select: { id: true, name: true } },
          toBank: { select: { id: true, name: true } },
        },
      });
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
