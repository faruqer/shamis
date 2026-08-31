import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

const payCreditSchema = z.object({
  personIds: z.array(z.string()).min(1),
});

function parseAmount(value: { toString(): string } | number) {
  return typeof value === "number" ? value : parseFloat(value.toString()) || 0;
}

function personOutstanding(amount: number, paidAmount: number) {
  return Math.max(0, amount - paidAmount);
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const { personIds } = payCreditSchema.parse(body);

    const existing = await prisma.import.findUnique({
      where: { id },
      include: { creditPersons: true },
    });
    if (!existing) return errorResponse("Import not found", 404);

    const creditAmount = parseAmount(existing.creditAmount);
    if (creditAmount <= 0) {
      throw new Error("This import has no credit amount");
    }
    if (existing.creditPaid) {
      throw new Error("Import credit is already fully paid");
    }

    const selected = existing.creditPersons.filter((person) => personIds.includes(person.id));
    if (selected.length !== personIds.length) {
      throw new Error("One or more selected credit persons were not found");
    }

    for (const person of selected) {
      const amount = parseAmount(person.amount);
      const paid = parseAmount(person.paidAmount);
      const outstanding = personOutstanding(amount, paid);
      if (outstanding <= 0) {
        throw new Error(`${person.name} is already fully paid`);
      }
    }

    const importRecord = await prisma.$transaction(async (tx) => {
      for (const person of selected) {
        await tx.importCreditPerson.update({
          where: { id: person.id },
          data: { paidAmount: person.amount },
        });
      }

      const persons = await tx.importCreditPerson.findMany({ where: { importId: id } });
      const creditPaidAmount = persons.reduce((sum, person) => sum + parseAmount(person.paidAmount), 0);
      const creditPaid = persons.every(
        (person) => personOutstanding(parseAmount(person.amount), parseAmount(person.paidAmount)) <= 0.001
      );

      return tx.import.update({
        where: { id },
        data: {
          creditPaidAmount,
          creditPaid,
        },
        include: {
          createdBy: { select: { name: true } },
          costs: { orderBy: { name: "asc" } },
          creditPersons: true,
          products: { include: { cartons: true } },
        },
      });
    });

    return jsonResponse(importRecord);
  } catch (error) {
    return handleApiError(error);
  }
}
