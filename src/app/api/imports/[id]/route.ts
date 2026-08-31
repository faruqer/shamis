import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";
import { Role, Prisma } from "@prisma/client";
import { sanitizeImportForRole } from "@/lib/import-sanitize";

const adminProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  unitCost: z.number().min(0),
  totalCartons: z.number().int().positive(),
  itemsPerCarton: z.number().int().positive(),
});

const salespersonProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  totalCartons: z.number().int().positive(),
  itemsPerCarton: z.number().int().positive(),
});

const creditPersonSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
});

const costSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
});

const importSchema = z.object({
  batchNumber: z.string().min(1),
  importDate: z.string().optional(),
  costs: z.array(costSchema).optional(),
  creditPersons: z.array(creditPersonSchema).optional(),
  notes: z.string().optional(),
  products: z.array(adminProductSchema).min(1),
});

const salespersonImportSchema = z.object({
  batchNumber: z.string().min(1),
  importDate: z.string().optional(),
  notes: z.string().optional(),
  products: z.array(salespersonProductSchema).min(1),
});

type IncomingProduct = {
  id?: string;
  name: string;
  unitCost?: number;
  totalCartons: number;
  itemsPerCarton: number;
};

type ExistingProduct = {
  id: string;
  name: string;
  unitCost: Prisma.Decimal;
  cartons: {
    id: string;
    cartonNumber: string;
    totalCartons: number;
    remainingCartons: number;
    itemsPerCarton: number;
    remainingItems: number;
    saleItems: { cartonsSold: number; itemsSold: number }[];
  }[];
};

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

function createCartonData(product: { totalCartons: number; itemsPerCarton: number }, index: number) {
  return {
    cartonNumber: String(index + 1),
    itemsPerCarton: product.itemsPerCarton,
    totalCartons: product.totalCartons,
    remainingCartons: product.totalCartons,
    remainingItems: product.totalCartons * product.itemsPerCarton,
    location: "WAREHOUSE" as const,
  };
}

function getCostsTotal(costs: { amount: number }[] | undefined) {
  return costs?.reduce((sum, cost) => sum + cost.amount, 0) ?? 0;
}

async function syncImportCosts(
  tx: Prisma.TransactionClient,
  importId: string,
  costs: { name: string; amount: number }[] | undefined
) {
  await tx.importCost.deleteMany({ where: { importId } });

  const filtered =
    costs?.filter((cost) => cost.name.trim() && cost.amount >= 0).map((cost) => ({
      importId,
      name: cost.name.trim(),
      amount: cost.amount,
    })) ?? [];

  if (filtered.length > 0) {
    await tx.importCost.createMany({ data: filtered });
  }

  await tx.import.update({
    where: { id: importId },
    data: { customCost: getCostsTotal(costs) },
  });
}

function productHasSales(product: ExistingProduct) {
  return product.cartons.some((carton) => carton.saleItems.length > 0);
}

function importHasSales(products: ExistingProduct[]) {
  return products.some((product) => productHasSales(product));
}

async function mergeImportProducts(
  tx: Prisma.TransactionClient,
  importId: string,
  incomingProducts: IncomingProduct[],
  existingProducts: ExistingProduct[],
  isAdmin: boolean
) {
  const existingById = new Map(existingProducts.map((product) => [product.id, product]));
  const claimedExistingIds = new Set<string>();

  for (const [index, product] of incomingProducts.entries()) {
    const existing = product.id ? existingById.get(product.id) : undefined;

    if (product.id && !existing) {
      throw new Error(`Product "${product.name}" was not found in this import`);
    }

    if (existing) {
      claimedExistingIds.add(existing.id);

      await tx.importProduct.update({
        where: { id: existing.id },
        data: {
          name: product.name,
          ...(isAdmin ? { unitCost: product.unitCost ?? 0 } : {}),
        },
      });

      const carton = existing.cartons[0];
      if (!carton) {
        await tx.carton.create({
          data: {
            productId: existing.id,
            ...createCartonData(product, index),
          },
        });
        continue;
      }

      const minTotalCartons = carton.totalCartons - carton.remainingCartons;
      if (product.totalCartons < minTotalCartons) {
        throw new Error(
          `Cannot set "${product.name}" below ${minTotalCartons} cartons — stock has already been sold or transferred`
        );
      }

      const cartonDelta = product.totalCartons - carton.totalCartons;
      const itemsPerCartonDelta = product.itemsPerCarton - carton.itemsPerCarton;
      let newRemainingItems =
        carton.remainingItems + cartonDelta * product.itemsPerCarton;

      if (itemsPerCartonDelta !== 0) {
        newRemainingItems += carton.totalCartons * itemsPerCartonDelta;
      }

      if (newRemainingItems < 0) {
        throw new Error(
          `Cannot reduce "${product.name}" items below what has already been sold or transferred`
        );
      }

      await tx.carton.update({
        where: { id: carton.id },
        data: {
          cartonNumber: String(index + 1),
          itemsPerCarton: product.itemsPerCarton,
          totalCartons: product.totalCartons,
          remainingCartons: carton.remainingCartons + cartonDelta,
          remainingItems: newRemainingItems,
        },
      });
      continue;
    }

    await tx.importProduct.create({
      data: {
        importId,
        name: product.name,
        unitCost: isAdmin ? product.unitCost ?? 0 : 0,
        productCustomCost: 0,
        taxSeaFreight: 0,
        cartons: {
          create: createCartonData(product, index),
        },
      },
    });
  }

  for (const existing of existingProducts) {
    if (claimedExistingIds.has(existing.id)) continue;

    if (productHasSales(existing)) {
      throw new Error(
        `Cannot remove "${existing.name}" — it has linked sales. Keep it in the batch or remove sales first.`
      );
    }

    await tx.importProduct.delete({ where: { id: existing.id } });
  }
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

async function loadExistingImport(id: string) {
  return prisma.import.findUnique({
    where: { id },
    include: {
      products: {
        include: {
          cartons: {
            include: {
              saleItems: { select: { cartonsSold: true, itemsSold: true } },
            },
          },
        },
      },
      creditPersons: true,
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const importRecord = await getImportWithRelations(id);
    if (!importRecord) return errorResponse("Import not found", 404);
    return jsonResponse(sanitizeImportForRole(importRecord, session.role));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await request.json();

    const existing = await loadExistingImport(id);
    if (!existing) return errorResponse("Import not found", 404);

    const duplicate = await prisma.import.findFirst({
      where: { batchNumber: body.batchNumber, NOT: { id } },
    });
    if (duplicate) throw new Error("Batch number already exists");

    const hasSales = importHasSales(existing.products);
    const isAdmin = session.role === Role.ADMIN;

    if (!hasSales) {
      if (!isAdmin) {
        const data = salespersonImportSchema.parse(body);
        const existingUnitCostByName = new Map(
          existing.products.map((product) => [
            product.name.trim().toLowerCase(),
            product.unitCost,
          ])
        );

        const importRecord = await prisma.$transaction(async (tx) => {
          await tx.importProduct.deleteMany({ where: { importId: id } });

          return tx.import.update({
            where: { id },
            data: {
              batchNumber: data.batchNumber,
              importDate: data.importDate ? new Date(data.importDate) : existing.importDate,
              notes: data.notes ?? existing.notes,
              products: {
                create: data.products.map((product, index) => ({
                  name: product.name,
                  unitCost:
                    existingUnitCostByName.get(product.name.trim().toLowerCase()) ?? 0,
                  productCustomCost: 0,
                  taxSeaFreight: 0,
                  cartons: {
                    create: createCartonData(product, index),
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

        return jsonResponse(sanitizeImportForRole(importRecord, session.role));
      }

      const data = importSchema.parse(body);
      const credit = resolveCreditFields(data, existing);
      validateCreditPersons(data.creditPersons);

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
              ? {
                  create: data.costs.map((cost) => ({
                    name: cost.name.trim(),
                    amount: cost.amount,
                  })),
                }
              : undefined,
            products: {
              create: data.products.map((product, index) => ({
                name: product.name,
                unitCost: product.unitCost,
                productCustomCost: 0,
                taxSeaFreight: 0,
                cartons: {
                  create: createCartonData(product, index),
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

      return jsonResponse(sanitizeImportForRole(importRecord, session.role));
    }

    if (!isAdmin) {
      const data = salespersonImportSchema.parse(body);

      const importRecord = await prisma.$transaction(async (tx) => {
        await tx.import.update({
          where: { id },
          data: {
            batchNumber: data.batchNumber,
            importDate: data.importDate ? new Date(data.importDate) : existing.importDate,
            notes: data.notes ?? existing.notes,
          },
        });

        await mergeImportProducts(tx, id, data.products, existing.products, false);

        return tx.import.findUniqueOrThrow({
          where: { id },
          include: {
            createdBy: { select: { name: true } },
            costs: true,
            creditPersons: true,
            products: { include: { cartons: true } },
          },
        });
      });

      return jsonResponse(sanitizeImportForRole(importRecord, session.role));
    }

    const data = importSchema.parse(body);
    const credit = resolveCreditFields(data, existing);
    validateCreditPersons(data.creditPersons);

    const importRecord = await prisma.$transaction(async (tx) => {
      await tx.importCreditPerson.deleteMany({ where: { importId: id } });

      await tx.import.update({
        where: { id },
        data: {
          batchNumber: data.batchNumber,
          importDate: data.importDate ? new Date(data.importDate) : existing.importDate,
          customCost: 0,
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
        },
      });

      await mergeImportProducts(tx, id, data.products, existing.products, true);
      await syncImportCosts(tx, id, data.costs);

      return tx.import.findUniqueOrThrow({
        where: { id },
        include: {
          createdBy: { select: { name: true } },
          costs: true,
          creditPersons: true,
          products: { include: { cartons: true } },
        },
      });
    });

    return jsonResponse(sanitizeImportForRole(importRecord, session.role));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireSession(Role.ADMIN);
    const { id } = await context.params;

    const existing = await loadExistingImport(id);
    if (!existing) return errorResponse("Import not found", 404);

    if (importHasSales(existing.products)) {
      throw new Error("Cannot delete import that has linked sales. Remove sales first.");
    }

    await prisma.import.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
