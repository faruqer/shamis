import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isSalesperson } from "@/lib/shop-scope";
import { Role } from "@prisma/client";

const receiverSchema = z.object({
  salespersonId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const receiverSelect = {
  id: true,
  salespersonId: true,
  name: true,
  phone: true,
  notes: true,
  isActive: true,
  createdAt: true,
  salesperson: { select: { id: true, name: true } },
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const salespersonId = request.nextUrl.searchParams.get("salespersonId");

    if (isSalesperson(session)) {
      const receivers = await prisma.hawalaReceiver.findMany({
        where: { salespersonId: session.id, isActive: true },
        select: receiverSelect,
        orderBy: { name: "asc" },
      });
      return jsonResponse(receivers);
    }

    await requireSession(Role.ADMIN);

    const where = salespersonId ? { salespersonId } : {};
    const receivers = await prisma.hawalaReceiver.findMany({
      where,
      select: receiverSelect,
      orderBy: [{ salesperson: { name: "asc" } }, { name: "asc" }],
    });
    return jsonResponse(receivers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = receiverSchema.parse(body);

    const salesperson = await prisma.user.findFirst({
      where: { id: data.salespersonId, role: Role.SALESPERSON, isActive: true },
    });
    if (!salesperson) throw new Error("Salesperson not found");

    const receiver = await prisma.hawalaReceiver.create({
      data: {
        salespersonId: data.salespersonId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
      },
      select: receiverSelect,
    });

    return jsonResponse(receiver, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
