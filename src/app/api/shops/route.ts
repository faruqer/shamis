import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const shopSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    await requireSession(Role.ADMIN);
    const shops = await prisma.shop.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
    return jsonResponse(shops);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = shopSchema.parse(body);

    const shop = await prisma.shop.create({
      data: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        notes: data.notes,
      },
      include: {
        _count: { select: { users: true } },
      },
    });

    return jsonResponse(shop, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
