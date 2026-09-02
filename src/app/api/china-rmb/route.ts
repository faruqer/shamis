import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { summarizeCredits } from "@/lib/china-rmb";

export async function GET() {
  try {
    await requireSession(Role.ADMIN);

    const [persons, credits] = await Promise.all([
      prisma.chinaRmbPerson.findMany({
        where: { isActive: true },
        include: {
          credits: {
            orderBy: [{ creditDate: "desc" }, { createdAt: "desc" }],
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.chinaRmbCredit.findMany({
        include: {
          person: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ creditDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const personSummaries = persons.map((person) => ({
      id: person.id,
      name: person.name,
      phone: person.phone,
      notes: person.notes,
      ...summarizeCredits(person.credits),
    }));

    const summary = summarizeCredits(credits);
    const friendsWithBalance = personSummaries.filter((person) => person.outstanding > 0.001).length;

    return jsonResponse({
      persons: personSummaries,
      credits,
      summary: {
        ...summary,
        friendsWithBalance,
        friendCount: persons.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
