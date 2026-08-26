import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    await requireSession();
    const salespersons = await prisma.user.findMany({
      where: { role: Role.SALESPERSON, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return jsonResponse(salespersons);
  } catch (error) {
    return handleApiError(error);
  }
}
