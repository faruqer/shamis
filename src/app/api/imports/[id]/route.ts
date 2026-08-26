import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";

const productSchema = z.object({
  name: z.string().min(1),
  unitCost: z.number().positive(),
  totalCartons: z.number().int().positive(),
  itemsPerCarton: z.number().int().positive(),
});

const costSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
});

const creditPersonSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
});

const importSchema = z.object({
  batchNumber: z.string().min(1),
  importDate: z.string().optional(),
  costs: z.array(costSchema).optional(),
  onCredit: z.boolean().optional(),
  creditAmount: z.number().min(0).optional(),
  creditPersons: z.array(creditPersonSchema).optional(),
  notes: z.string().optional(),
  products: z.array(productSchema).min(1),
});

function getCreditTotal(creditPersons: { amount: number }[] | undefined) {
  return creditPersons?.reduce((sum, person) => sum + person.amount, 0) ?? 0;
}

function validateCreditPersons(creditPersons: { name: string; amount: number }[] | undefined) {
  if (!creditPersons?.length) return;
  const names = creditPersons.map((person) => person.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new Error("Each person can only appear once in import credit");
  }
}

function getCostsTotal(costs: { amount: number }[] | undefined) {
  return costs?.reduce((sum, cost) => sum + cost.amount, 0) ?? 0;
}

function resolveCreditFields(
  data: z.infer<typeof importSchema>,
  existing?: {
    creditPaidAmount: { toString(): string };
  }
) {
  const creditAmount = getCreditTotal(data.creditPersons);

  const existingPaid = existing
    ? parseFloat(existing.creditPaidAmount.toString()) || 0
    : 0;

  if (existingPaid > creditAmount + 0.001) {
    throw new Error(
      `Credit total cannot be less than the amount already paid (${existingPaid.toFixed(2)})`
    );
  }

  const creditPaidAmount = Math.min(existingPaid, creditAmount);
  return {
    creditAmount,
    creditPaidAmount,
    creditPaid: creditAmount > 0 && creditPaidAmount >= creditAmount - 0.001,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

async function getImportWithRelations(id: string) {
  return prisma.import.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      costs: { orderBy: { name: "asc" } },
      creditPersons: true,
      products: { include: { cartons: true } },
    },
  });
}

async function importHasSales(importId: string) {
  const count = await prisma.saleItem.count({
    where: { carton: { product: { importId } } },
  });
  return count > 0;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession();
    const { id } = await context.params;
    const importRecord = await getImportWithRelations(id);
    if (!importRecord) return errorResponse("Import not found", 404);
    return jsonResponse(importRecord);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;
    const body = await request.json();
    const data = importSchema.parse(body);

    const existing = await prisma.import.findUnique({ where: { id } });
    if (!existing) return errorResponse("Import not found", 404);

    const credit = resolveCreditFields(data, existing);
    validateCreditPersons(data.creditPersons);

    const duplicate = await prisma.import.findFirst({
      where: { batchNumber: data.batchNumber, NOT: { id } },
    });
    if (duplicate) throw new Error("Batch number already exists");

    const hasSales = await importHasSales(id);
    if (hasSales) {
      throw new Error("Cannot edit import that has linked sales. Remove sales first.");
    }

    const importRecord = await prisma.$transaction(async (tx) => {
      await tx.importProduct.deleteMany({ where: { importId: id } });
      await tx.importCost.deleteMany({ where: { importId: id } });
      await tx.importCreditPerson.deleteMany({ where: { importId: id } });

      return tx.import.update({
        where: { id },
        data: {
          batchNumber: data.batchNumber,
          importDate: data.importDate ? new Date(data.importDate) : existing.importDate,
          customCost: getCostsTotal(data.costs),
          creditAmount: credit.creditAmount,
          creditPaidAmount: credit.creditPaidAmount,
          creditPaid: credit.creditPaid,
          notes: data.notes,
          creditPersons: data.creditPersons?.length
            ? {
                create: data.creditPersons.map((person) => ({
                  name: person.name.trim(),
                  amount: person.amount,
                })),
              }
            : undefined,
          costs: data.costs?.length
            ? { create: data.costs.map((cost) => ({ name: cost.name.trim(), amount: cost.amount })) }
            : undefined,
          products: {
            create: data.products.map((product, index) => ({
              name: product.name,
              unitCost: product.unitCost,
              cartons: {
                create: {
                  cartonNumber: String(index + 1),
                  itemsPerCarton: product.itemsPerCarton,
                  totalCartons: product.totalCartons,
                  remainingCartons: product.totalCartons,
                  remainingItems: product.totalCartons * product.itemsPerCarton,
                  location: "WAREHOUSE",
                },
              },
            })),
          },
        },
        include: {
          createdBy: { select: { name: true } },
          costs: true,
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await prisma.import.findUnique({ where: { id } });
    if (!existing) return errorResponse("Import not found", 404);

    const hasSales = await importHasSales(id);
    if (hasSales) {
      throw new Error("Cannot delete import that has linked sales. Remove sales first.");
    }

    await prisma.import.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
