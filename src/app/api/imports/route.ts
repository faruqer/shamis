import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { Role } from "@prisma/client";
import { sanitizeImportsForRole, sanitizeImportForRole } from "@/lib/import-sanitize";

const adminProductSchema = z.object({
  name: z.string().min(1),
  unitCost: z.number().positive(),
  totalCartons: z.number().int().positive(),
  itemsPerCarton: z.number().int().positive(),
  productCustomCost: z.number().min(0).optional(),
  taxSeaFreight: z.number().min(0).optional(),
});

const productSchema = adminProductSchema;

const salespersonProductSchema = z.object({
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

const salespersonImportSchema = z.object({
  batchNumber: z.string().min(1),
  importDate: z.string().optional(),
  notes: z.string().optional(),
  products: z.array(salespersonProductSchema).min(1),
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

function resolveCreditFields(data: z.infer<typeof importSchema>) {
  const creditAmount = getCreditTotal(data.creditPersons);
  return { creditAmount, creditPaidAmount: 0, creditPaid: false };
}

export async function GET() {
  try {
    const session = await requireSession();
    const imports = await prisma.import.findMany({
      include: {
        createdBy: { select: { name: true } },
        costs: { orderBy: { name: "asc" } },
        creditPersons: true,
        products: {
          include: {
            cartons: true,
          },
        },
      },
      orderBy: { importDate: "desc" },
    });
    return jsonResponse(sanitizeImportsForRole(imports, session.role));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    if (session.role !== Role.ADMIN) {
      const data = salespersonImportSchema.parse(body);

      const existing = await prisma.import.findUnique({
        where: { batchNumber: data.batchNumber },
      });
      if (existing) {
        throw new Error("Batch number already exists");
      }

      const importRecord = await prisma.import.create({
        data: {
          batchNumber: data.batchNumber,
          importDate: data.importDate ? new Date(data.importDate) : new Date(),
          customCost: 0,
          creditAmount: 0,
          creditPaidAmount: 0,
          creditPaid: false,
          notes: data.notes,
          createdById: session.id,
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

      return jsonResponse(sanitizeImportForRole(importRecord, session.role), 201);
    }

    const data = importSchema.parse(body);
    const credit = resolveCreditFields(data);
    validateCreditPersons(data.creditPersons);

    const existing = await prisma.import.findUnique({
      where: { batchNumber: data.batchNumber },
    });
    if (existing) {
      throw new Error("Batch number already exists");
    }

    const importRecord = await prisma.import.create({
      data: {
        batchNumber: data.batchNumber,
        importDate: data.importDate ? new Date(data.importDate) : new Date(),
        customCost: getCostsTotal(data.costs),
        creditAmount: credit.creditAmount,
        creditPaidAmount: credit.creditPaidAmount,
        creditPaid: credit.creditPaid,
        notes: data.notes,
        createdById: session.id,
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
            productCustomCost: product.productCustomCost ?? 0,
            taxSeaFreight: product.taxSeaFreight ?? 0,
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
        costs: true,
        creditPersons: true,
        products: { include: { cartons: true } },
      },
    });

    return jsonResponse(sanitizeImportForRole(importRecord, session.role), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
