import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getChinaRmbPersonOrThrow } from "@/lib/china-rmb-db";

const creditSchema = z.object({
  personId: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
  notes: z.string().optional(),
  creditDate: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = creditSchema.parse(body);

    await getChinaRmbPersonOrThrow(data.personId);

    const credit = await prisma.chinaRmbCredit.create({
      data: {
        personId: data.personId,
        amount: data.amount,
        description: data.description?.trim() || null,
        notes: data.notes?.trim() || null,
        creditDate: data.creditDate ? new Date(data.creditDate) : new Date(),
        createdById: session.id,
      },
      include: {
        person: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    });

    return jsonResponse(credit, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
