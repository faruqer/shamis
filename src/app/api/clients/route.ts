import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const clientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    await requireSession();
    const clients = await prisma.client.findMany({
      include: {
        _count: { select: { sales: true } },
      },
      orderBy: { name: "asc" },
    });
    return jsonResponse(clients);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await request.json();
    const data = clientSchema.parse(body);

    const client = await prisma.client.create({ data });
    return jsonResponse(client, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
