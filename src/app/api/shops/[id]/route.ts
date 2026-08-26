import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const shopUpdateSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = shopUpdateSchema.parse(body);

    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) return errorResponse("Shop not found", 404);

    const shop = await prisma.shop.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        notes: data.notes,
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: { _count: { select: { users: true } } },
    });

    return jsonResponse(shop);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await prisma.shop.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) return errorResponse("Shop not found", 404);

    if (existing._count.users > 0) {
      throw new Error("Cannot delete shop with assigned users. Reassign users first.");
    }

    await prisma.shop.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
