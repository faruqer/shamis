import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const existing = await prisma.hawalaReceiver.findUnique({ where: { id } });
    if (!existing) throw new Error("Receiver not found");

    const receiver = await prisma.hawalaReceiver.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: receiverSelect,
    });

    return jsonResponse(receiver);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await params;

    const existing = await prisma.hawalaReceiver.findUnique({ where: { id } });
    if (!existing) throw new Error("Receiver not found");

    await prisma.hawalaReceiver.update({
      where: { id },
      data: { isActive: false },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
