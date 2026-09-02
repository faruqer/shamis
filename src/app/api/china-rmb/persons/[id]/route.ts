import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getChinaRmbPersonOrThrow } from "@/lib/china-rmb-db";

const personSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = personSchema.parse(body);

    await getChinaRmbPersonOrThrow(id);

    const person = await prisma.chinaRmbPerson.update({
      where: { id },
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return jsonResponse(person);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const person = await getChinaRmbPersonOrThrow(id);

    if (person.credits.length > 0) {
      await prisma.chinaRmbPerson.update({
        where: { id },
        data: { isActive: false },
      });
      return jsonResponse({ success: true, deactivated: true });
    }

    await prisma.chinaRmbPerson.delete({ where: { id } });
    return jsonResponse({ success: true, deactivated: false });
  } catch (error) {
    return handleApiError(error);
  }
}
