import { NextRequest } from "next/server";
import { z } from "zod";
import { ChinaRmbEntryType, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { computeChinaRmbBalance, computeChinaRmbTotals } from "@/lib/china-rmb";

const entrySchema = z.object({
  type: z.nativeEnum(ChinaRmbEntryType),
  amount: z.number().positive(),
  description: z.string().min(1),
  notes: z.string().optional(),
  reference: z.string().optional(),
  entryDate: z.string().optional(),
});

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

    return jsonResponse({
      entries,
      balance,
      totalCredit,
      totalDebit,
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

    const entry = await prisma.chinaRmbEntry.create({
      data: {
        type: data.type,
        amount: data.amount,
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
