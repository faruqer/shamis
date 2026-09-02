import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  getChinaRmbCreditOrThrow,
  getChinaRmbPersonOrThrow,
} from "@/lib/china-rmb-db";
import { parseRmbAmount } from "@/lib/china-rmb";

const creditSchema = z.object({
  personId: z.string().min(1),
  amount: z.number().positive(),
  paidAmount: z.number().min(0).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  creditDate: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = creditSchema.parse(body);

    const existing = await getChinaRmbCreditOrThrow(id);
    await getChinaRmbPersonOrThrow(data.personId);

    const paidAmount = data.paidAmount ?? parseRmbAmount(existing.paidAmount);
    if (paidAmount > data.amount + 0.001) {
      throw new Error("Paid amount cannot exceed credit amount");
    }

    const credit = await prisma.chinaRmbCredit.update({
      where: { id },
      data: {
        personId: data.personId,
        amount: data.amount,
        paidAmount,
        description: data.description?.trim() || null,
        notes: data.notes?.trim() || null,
        creditDate: data.creditDate ? new Date(data.creditDate) : undefined,
      },
      include: {
        person: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    });

    return jsonResponse(credit);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    await getChinaRmbCreditOrThrow(id);
    await prisma.chinaRmbCredit.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
