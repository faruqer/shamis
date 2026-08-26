import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { hashPassword, requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const userUpdateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "SALESPERSON"]),
  shopId: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  shopId: true,
  createdAt: true,
  shop: { select: { id: true, name: true } },
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = userUpdateSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return errorResponse("User not found", 404);

    const duplicate = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id } },
    });
    if (duplicate) throw new Error("Email already exists");

    if (data.shopId) {
      const shop = await prisma.shop.findUnique({ where: { id: data.shopId } });
      if (!shop) throw new Error("Shop not found");
    }

    const updateData: {
      email: string;
      name: string;
      role: Role;
      shopId: string | null;
      isActive?: boolean;
      passwordHash?: string;
    } = {
      email: data.email,
      name: data.name,
      role: data.role as Role,
      shopId: data.shopId ?? null,
    };

    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await hashPassword(data.password);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });

    return jsonResponse(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession(Role.ADMIN);
    const { id } = await context.params;

    if (session.id === id) throw new Error("You cannot delete your own account");

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return errorResponse("User not found", 404);

    await prisma.user.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
