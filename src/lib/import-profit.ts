import prisma from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { getSaleProfit, type SaleProfitItem } from "@/lib/sale-utils";
import { SaleType } from "@prisma/client";

function toProfitItem(item: {
  cartonsSold: number;
  itemsSold: number;
  unitPrice: { toString(): string };
  carton: {
    itemsPerCarton: number;
    warehouseLeavingPrice: { toString(): string } | null;
    product: { unitCost: { toString(): string } };
  };
}): SaleProfitItem {
  return {
    cartonsSold: item.cartonsSold,
    itemsSold: item.itemsSold,
    unitPrice: decimalToNumber(item.unitPrice),
    carton: {
      itemsPerCarton: item.carton.itemsPerCarton,
      warehouseLeavingPrice: item.carton.warehouseLeavingPrice
        ? decimalToNumber(item.carton.warehouseLeavingPrice)
        : null,
      product: { unitCost: item.carton.product.unitCost.toString() },
    },
  };
}

export async function getImportProfitByImportId() {
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: { type: { in: [SaleType.WHOLESALE, SaleType.RETAIL] } },
    },
    select: {
      cartonsSold: true,
      itemsSold: true,
      unitPrice: true,
      totalPrice: true,
      sale: { select: { type: true } },
      carton: {
        select: {
          itemsPerCarton: true,
          warehouseLeavingPrice: true,
          product: { select: { importId: true, unitCost: true } },
        },
      },
    },
  });

  const profitByImport = new Map<string, number>();

  for (const item of saleItems) {
    const importId = item.carton.product.importId;
    if (!importId) continue;

    const itemRevenue = decimalToNumber(item.totalPrice);
    const itemProfit = getSaleProfit(
      itemRevenue,
      [toProfitItem(item)],
      item.sale.type as "WHOLESALE" | "RETAIL"
    );

    profitByImport.set(importId, (profitByImport.get(importId) ?? 0) + itemProfit);
  }

  return profitByImport;
}
