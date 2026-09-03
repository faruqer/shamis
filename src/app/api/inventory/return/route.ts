import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { Role, LedgerType } from "@prisma/client";
import {
  generateReturnReference,
  getShopSalesperson,
  returnStockToWarehouse,
} from "@/lib/shop-stock";

const returnSchema = z.object({
  cartonId: z.string(),
  cartonsToReturn: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const data = returnSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const shopCarton = await tx.carton.findUnique({
        where: { id: data.cartonId },
        include: { product: { select: { name: true } } },
      });

      if (!shopCarton) throw new Error("Product not found in shop");
      if (shopCarton.location !== "SHOP") {
        throw new Error("Only shop stock can be returned to the warehouse");
      }
      if (!shopCarton.shopId) {
        throw new Error("Shop stock location is invalid");
      }

      if (isSalesperson(session)) {
        const shopId = requireSalespersonShopId(session);
        if (shopCarton.shopId !== shopId) {
          throw new Error("You can only return stock from your assigned shop");
        }
      } else if (session.role !== Role.ADMIN) {
        throw new Error("Forbidden");
      }

      const wholesaleUnit = decimalToNumber(shopCarton.warehouseLeavingPrice);
      if (wholesaleUnit <= 0) {
        throw new Error(
          `Missing wholesale price for ${shopCarton.product.name}. Cannot calculate return credit.`
        );
      }

      const { shopId, itemsReturned } = await returnStockToWarehouse(
        tx,
        shopCarton,
        data.cartonsToReturn
      );

      const returnAmount = itemsReturned * wholesaleUnit;
      const returnRef = generateReturnReference();
      const shopSalesperson = await getShopSalesperson(tx, shopId);

      await tx.salespersonLedger.create({
        data: {
          userId: shopSalesperson.id,
          type: LedgerType.ADJUSTMENT,
          amount: -returnAmount,
          description: `Stock returned to warehouse ${returnRef} · ${shopCarton.product.name}`,
        },
      });

      return {
        reference: returnRef,
        productName: shopCarton.product.name,
        cartonsReturned: data.cartonsToReturn,
        itemsReturned,
        returnAmount,
      };
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
