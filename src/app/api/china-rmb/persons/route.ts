import { NextRequest } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const personSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireSession(Role.ADMIN);
    const body = await request.json();
    const data = personSchema.parse(body);

    const person = await prisma.chinaRmbPerson.create({
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });

    return jsonResponse(person, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
