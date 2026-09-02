import { NextRequest } from "next/server";
import { z } from "zod";
import { ChinaRmbEntryType, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const entrySchema = z.object({
  type: z.nativeEnum(ChinaRmbEntryType),
  amount: z.number().positive(),
  description: z.string().min(1),
  notes: z.string().optional(),
  reference: z.string().optional(),
  entryDate: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = entrySchema.parse(body);

    const existing = await prisma.chinaRmbEntry.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Entry not found");
    }

    const entry = await prisma.chinaRmbEntry.update({
      where: { id },
      data: {
        type: data.type,
        amount: data.amount,
        description: data.description,
        notes: data.notes,
        reference: data.reference,
        entryDate: data.entryDate ? new Date(data.entryDate) : undefined,
      },
      include: {
        createdBy: { select: { name: true } },
      },
    });

    return jsonResponse(entry);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await prisma.chinaRmbEntry.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Entry not found");
    }

    await prisma.chinaRmbEntry.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
