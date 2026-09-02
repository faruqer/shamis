import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getChinaRmbCreditOrThrow } from "@/lib/china-rmb-db";
import {
  creditOutstanding,
  isCreditSettled,
  nextPaidAmount,
  parseRmbAmount,
  validateCreditPayment,
} from "@/lib/china-rmb";

const paySchema = z.object({
  amount: z.number().positive().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = paySchema.parse(body);

    const existing = await getChinaRmbCreditOrThrow(id);
    const amount = parseRmbAmount(existing.amount);
    const paidAmount = parseRmbAmount(existing.paidAmount);
    const outstanding = creditOutstanding(amount, paidAmount);

    if (isCreditSettled(amount, paidAmount)) {
      throw new Error("This credit is already fully paid back");
    }

    const payment = data.amount ?? outstanding;
    validateCreditPayment(amount, paidAmount, payment);

    const credit = await prisma.chinaRmbCredit.update({
      where: { id },
      data: { paidAmount: nextPaidAmount(paidAmount, payment) },
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
