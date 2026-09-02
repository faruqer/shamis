import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getSaleById, reverseSale, updateRetailSale } from "@/lib/sale-mutations";

const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHECK", "OTHER"]);

const retailUpdateSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  paymentOption: z.enum(["PAID", "CREDIT", "PARTIAL"]),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: paymentMethodSchema.optional(),
  bankAccountId: z.string().optional(),
  saleDate: z.string().optional(),
  saleDateEthiopian: z.string().optional(),
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
