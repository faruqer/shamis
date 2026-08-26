import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { hashPassword, requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "SALESPERSON"]),
  shopId: z.string().nullable().optional(),
});

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

export async function GET() {
  try {
    await requireSession(Role.ADMIN);
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(users);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = userSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error("Email already exists");

    if (data.shopId) {
      const shop = await prisma.shop.findUnique({ where: { id: data.shopId } });
      if (!shop) throw new Error("Shop not found");
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await hashPassword(data.password),
        role: data.role as Role,
        shopId: data.shopId ?? null,
      },
      select: userSelect,
    });

    return jsonResponse(user, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
