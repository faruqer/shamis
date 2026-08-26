import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const bankSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const banks = await prisma.bankAccount.findMany({
      where: session.role === Role.ADMIN ? undefined : { isActive: true },
      orderBy: { name: "asc" },
    });
    return jsonResponse(banks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await request.json();
    const data = bankSchema.parse(body);

    const bank = await prisma.bankAccount.create({
      data: {
        name: data.name.trim(),
        isActive: data.isActive ?? true,
      },
    });

    return jsonResponse(bank, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
