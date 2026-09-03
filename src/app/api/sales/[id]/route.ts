import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { SaleType } from "@prisma/client";
import {
  getSaleById,
  reverseSale,
  updateRetailSale,
  updateShopTransfer,
} from "@/lib/sale-mutations";

const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHECK", "OTHER"]);

const shopTransferItemSchema = z.object({
  cartonId: z.string(),
  cartonsSold: z.number().int().positive(),
  warehouseLeavingPrice: z.number().positive(),
  retailUnitPrice: z.number().positive(),
});

const paymentSplitSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amount: z.number().positive(),
  bankAccountId: z.string().optional(),
});

const retailUpdateSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  paymentOption: z.enum(["PAID", "CREDIT", "PARTIAL"]),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: paymentMethodSchema.optional(),
  bankAccountId: z.string().optional(),
  paymentSplits: z.array(paymentSplitSchema).optional(),
  saleDate: z.string().optional(),
  saleDateEthiopian: z.string().optional(),
  saleTime: z.string().optional(),
  items: z
    .array(
      z.object({
        cartonId: z.string(),
        cartonsSold: z.number().int().min(0).optional(),
        itemsSold: z.number().int().min(0).optional(),
        unitPrice: z.number().positive(),
      })
    )
    .min(1),
});

const shopTransferUpdateSchema = z.object({
  shopId: z.string(),
  saleDate: z.string().optional(),
  saleDateEthiopian: z.string().optional(),
  saleTime: z.string().optional(),
  items: z.array(shopTransferItemSchema).min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const sale = await getSaleById(session, id);
    return jsonResponse(sale);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.sale.findUnique({
      where: { id },
      select: { type: true },
    });
    if (!existing) throw new Error("Sale not found");

    if (existing.type === SaleType.SHOP_TRANSFER) {
      const data = shopTransferUpdateSchema.parse(body);
      const sale = await updateShopTransfer(session, id, data);
      return jsonResponse(sale);
    }

    const data = retailUpdateSchema.parse(body);
    const sale = await updateRetailSale(session, id, data);
    return jsonResponse(sale);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    await reverseSale(session, id);
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
