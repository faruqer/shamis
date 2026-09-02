import { NextRequest } from "next/server";
import { z } from "zod";
import { ChinaRmbEntryType, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { computeChinaRmbBalance, computeChinaRmbTotals, computeChinaRmbOutstanding } from "@/lib/china-rmb";

const entrySchema = z.object({
  type: z.nativeEnum(ChinaRmbEntryType),
  amount: z.number().positive(),
  paidAmount: z.number().min(0).optional(),
  description: z.string().min(1),
  notes: z.string().optional(),
  reference: z.string().optional(),
  entryDate: z.string().optional(),
});

function validatePaidAmount(amount: number, paidAmount: number) {
  if (paidAmount > amount + 0.001) {
    throw new Error(`Paid amount cannot exceed ${amount}`);
  }
}

export async function GET() {
  try {
    await requireSession(Role.ADMIN);

    const entries = await prisma.chinaRmbEntry.findMany({
      include: {
        createdBy: { select: { name: true } },
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    });

    const balance = computeChinaRmbBalance(entries);
    const { totalCredit, totalDebit } = computeChinaRmbTotals(entries);
    const totalOutstanding = computeChinaRmbOutstanding(entries);

    return jsonResponse({
      entries,
      balance,
      totalCredit,
      totalDebit,
      totalOutstanding,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = entrySchema.parse(body);
    const paidAmount = data.paidAmount ?? 0;
    validatePaidAmount(data.amount, paidAmount);

    const entry = await prisma.chinaRmbEntry.create({
      data: {
        type: data.type,
        amount: data.amount,
        paidAmount,
        description: data.description,
        notes: data.notes,
        reference: data.reference,
        entryDate: data.entryDate ? new Date(data.entryDate) : new Date(),
        createdById: session.id,
      },
      include: {
        createdBy: { select: { name: true } },
      },
    });

    return jsonResponse(entry, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
