import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const bankUpdateSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireSession();
    const { id } = await context.params;
    const body = await request.json();
    const data = bankUpdateSchema.parse(body);

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) return errorResponse("Bank not found", 404);

    const bank = await prisma.bankAccount.update({
      where: { id },
      data: {
        name: data.name.trim(),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return jsonResponse(bank);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) return errorResponse("Bank not found", 404);

    if (existing._count.payments > 0) {
      await prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
      return jsonResponse({ success: true, deactivated: true });
    }

    await prisma.bankAccount.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
