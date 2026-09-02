import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const paidSchema = z.object({
  paidAmount: z.number().min(0),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = paidSchema.parse(body);

    const existing = await prisma.chinaRmbEntry.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Entry not found");
    }

    const entryAmount = Number(existing.amount);
    if (data.paidAmount > entryAmount + 0.001) {
      throw new Error(`Paid amount cannot exceed ${entryAmount}`);
    }

    const entry = await prisma.chinaRmbEntry.update({
      where: { id },
      data: { paidAmount: data.paidAmount },
      include: {
        createdBy: { select: { name: true } },
      },
    });

    return jsonResponse(entry);
  } catch (error) {
    return handleApiError(error);
  }
}
