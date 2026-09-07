import {
  LedgerType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SaleType,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { ensureSaleDateEthiopian, resolveSaleDates } from "@/lib/sale-dates";
import { buildSaleUpdateData, persistSaleDateEthiopian } from "@/lib/sale-prisma";
import type { SessionUser } from "@/lib/auth-edge";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { getShopSalesperson, transferStockToShop } from "@/lib/shop-stock";
import { createSalePayments, normalizePaymentSplits } from "@/lib/sale-payments";

type Tx = Prisma.TransactionClient;

export type RetailSaleUpdateInput = {
  clientId?: string;
  clientName?: string;
  paymentOption: "PAID" | "CREDIT" | "PARTIAL";
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  paymentSplits?: {
    paymentMethod: PaymentMethod;
    amount: number;
    bankAccountId?: string;
  }[];
  saleDate?: string;
  saleDateEthiopian?: string;
  items: {
    cartonId: string;
    cartonsSold?: number;
    itemsSold?: number;
    unitPrice: number;
  }[];
};

async function getSaleForModify(saleId: string) {
  return prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { carton: { include: { product: true } } } },
      payments: true,
      ledgerEntries: true,
    },
  });
}

export function assertCanModifySale(
  session: SessionUser,
  sale: { type: SaleType; shopId: string | null; retailSoldById: string | null }
) {
  if (sale.type === SaleType.SHOP_TRANSFER) {
    if (session.role !== Role.ADMIN) {
      throw new Error("Only admins can modify shop transfers");
    }
    return;
  }
  if (isSalesperson(session)) {
    if (sale.type !== SaleType.RETAIL) {
      throw new Error("You can only modify retail sales");
    }
    const shopId = requireSalespersonShopId(session);
    if (sale.shopId !== shopId) {
      throw new Error("You can only modify sales from your shop");
    }
  }
}

async function restoreSaleStock(tx: Tx, saleId: string) {
  const items = await tx.saleItem.findMany({
    where: { saleId },
    include: { carton: true },
  });

  for (const item of items) {
    const moved = item.cartonsSold * item.carton.itemsPerCarton + item.itemsSold;
    await tx.carton.update({
      where: { id: item.cartonId },
      data: {
        remainingCartons: item.carton.remainingCartons + item.cartonsSold,
        remainingItems: item.carton.remainingItems + moved,
      },
    });
  }
}

async function reverseShopTransferStock(
  tx: Tx,
  sale: {
    shopId: string | null;
    items: { cartonId: string; cartonsSold: number; itemsSold: number }[];
  }
) {
  if (!sale.shopId) throw new Error("Transfer shop not found");

  for (const item of sale.items) {
    const cartonsToReverse = item.cartonsSold;
    const itemsToReverse = item.itemsSold;

    const carton = await tx.carton.findUnique({
      where: { id: item.cartonId },
      include: { product: { select: { name: true } } },
    });
    if (!carton) throw new Error("Carton not found");

    const productName = carton.product.name;

    if (carton.location === "SHOP" && carton.shopId === sale.shopId) {
      if (
        carton.remainingCartons < cartonsToReverse ||
        carton.remainingItems < itemsToReverse
      ) {
        throw new Error(
          `Cannot reverse transfer for "${productName}": shop stock was partially sold or moved`
        );
      }

      await tx.carton.update({
        where: { id: carton.id },
        data: {
          location: "WAREHOUSE",
          shopId: null,
          warehouseLeavingPrice: null,
          retailUnitPrice: null,
        },
      });
      continue;
    }

    if (carton.location !== "WAREHOUSE") {
      throw new Error(
        `Cannot reverse transfer for "${productName}": stock is in an unexpected location`
      );
    }

    const shopCarton = await tx.carton.findFirst({
      where: {
        productId: carton.productId,
        location: "SHOP",
        shopId: sale.shopId,
      },
    });

    if (!shopCarton) {
      throw new Error(`Shop stock not found for "${productName}"`);
    }

    if (
      shopCarton.remainingCartons < cartonsToReverse ||
      shopCarton.remainingItems < itemsToReverse
    ) {
      throw new Error(
        `Cannot reverse transfer for "${productName}": not enough stock left in the shop (some may have been sold)`
      );
    }

    const newShopCartons = shopCarton.remainingCartons - cartonsToReverse;
    const newShopItems = shopCarton.remainingItems - itemsToReverse;

    if (newShopCartons === 0 && newShopItems === 0) {
      await tx.carton.delete({ where: { id: shopCarton.id } });
    } else {
      await tx.carton.update({
        where: { id: shopCarton.id },
        data: {
          remainingCartons: newShopCartons,
          remainingItems: newShopItems,
          totalCartons: shopCarton.totalCartons - cartonsToReverse,
        },
      });
    }

    await tx.carton.update({
      where: { id: carton.id },
      data: {
        remainingCartons: carton.remainingCartons + cartonsToReverse,
        remainingItems: carton.remainingItems + itemsToReverse,
      },
    });
  }
}

function getPaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid >= total) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "CREDIT";
}

async function clearSaleFinancials(tx: Tx, saleId: string) {
  await tx.salespersonLedger.deleteMany({ where: { saleId } });
  await tx.payment.deleteMany({ where: { saleId } });
}

export type SaleForReverse = NonNullable<Awaited<ReturnType<typeof getSaleForModify>>>;

export async function reverseSaleInTransaction(tx: Tx, sale: SaleForReverse) {
  if (sale.type === SaleType.SHOP_TRANSFER) {
    await reverseShopTransferStock(tx, sale);
  } else {
    await restoreSaleStock(tx, sale.id);
  }
  await clearSaleFinancials(tx, sale.id);
  await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
  await tx.sale.delete({ where: { id: sale.id } });
}

export async function reverseSale(session: SessionUser, saleId: string) {
  const sale = await getSaleForModify(saleId);
  if (!sale) throw new Error("Sale not found");
  assertCanModifySale(session, sale);

  await prisma.$transaction(async (tx) => {
    await reverseSaleInTransaction(tx, sale);
  });
}

const RESET_SALE_TYPES: SaleType[] = [
  SaleType.RETAIL,
  SaleType.SHOP_TRANSFER,
  SaleType.WHOLESALE,
];

export async function resetSalesByTypes(types: SaleType[] = RESET_SALE_TYPES) {
  const results: { reversed: string[]; failed: { saleNumber: string; error: string }[] } = {
    reversed: [],
    failed: [],
  };

  for (const type of types) {
    const sales = await prisma.sale.findMany({
      where: { type },
      include: {
        items: { include: { carton: { include: { product: true } } } },
        payments: true,
        ledgerEntries: true,
      },
      orderBy: { createdAt: "desc" },
    });

    for (const sale of sales) {
      try {
        await prisma.$transaction(async (tx) => {
          await reverseSaleInTransaction(tx, sale);
        });
        results.reversed.push(sale.saleNumber);
      } catch (error) {
        results.failed.push({
          saleNumber: sale.saleNumber,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return results;
}

export async function updateRetailSale(
  session: SessionUser,
  saleId: string,
  data: RetailSaleUpdateInput
) {
  const sale = await getSaleForModify(saleId);
  if (!sale) throw new Error("Sale not found");
  if (sale.type !== SaleType.RETAIL) throw new Error("Only retail sales can be edited");
  assertCanModifySale(session, sale);

  return prisma.$transaction(async (tx) => {
    await restoreSaleStock(tx, saleId);
    await clearSaleFinancials(tx, saleId);
    await tx.saleItem.deleteMany({ where: { saleId } });

    let clientId = data.clientId;
    if (!clientId && data.clientName) {
      const client = await tx.client.create({ data: { name: data.clientName.trim() } });
      clientId = client.id;
    }
    if (!clientId) throw new Error("Client is required");

    let totalAmount = 0;
    let retailShopId = sale.shopId ?? undefined;
    const saleItems: {
      cartonId: string;
      cartonsSold: number;
      itemsSold: number;
      unitPrice: number;
      totalPrice: number;
    }[] = [];

    for (const item of data.items) {
      const carton = await tx.carton.findUnique({
        where: { id: item.cartonId },
        include: { product: true },
      });
      if (!carton) throw new Error(`Carton not found: ${item.cartonId}`);
      if (carton.location !== "SHOP") {
        throw new Error("Retail sales can only be made from shop inventory");
      }
      if (isSalesperson(session)) {
        const shopId = requireSalespersonShopId(session);
        if (carton.shopId !== shopId) {
          throw new Error("You can only sell stock from your assigned shop");
        }
      }

      const cartonsSold = item.cartonsSold ?? 0;
      const itemsSold = item.itemsSold ?? 0;
      if (cartonsSold === 0 && itemsSold === 0) {
        throw new Error("Each line must have cartons or items quantity");
      }
      if (cartonsSold > carton.remainingCartons) {
        throw new Error(`Not enough cartons for ${carton.product.name}`);
      }

      const itemsQuantity = cartonsSold * carton.itemsPerCarton + itemsSold;
      if (itemsQuantity <= 0 || itemsQuantity > carton.remainingItems) {
        throw new Error(`Not enough stock for ${carton.product.name}`);
      }

      const itemTotal = itemsQuantity * item.unitPrice;
      totalAmount += itemTotal;

      const wholesaleUnit = decimalToNumber(carton.warehouseLeavingPrice);
      if (wholesaleUnit <= 0) {
        throw new Error(`Missing wholesale price for ${carton.product.name}. Re-transfer stock to the shop first.`);
      }

      saleItems.push({
        cartonId: item.cartonId,
        cartonsSold,
        itemsSold,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal,
      });

      if (carton.shopId) retailShopId = carton.shopId;

      await tx.carton.update({
        where: { id: item.cartonId },
        data: {
          remainingCartons: carton.remainingCartons - cartonsSold,
          remainingItems: carton.remainingItems - itemsSold - cartonsSold * carton.itemsPerCarton,
        },
      });
    }

    let paidAmount = 0;
    let paymentStatus: PaymentStatus;

    if (data.paymentOption === "PAID") {
      paidAmount = totalAmount;
      paymentStatus = "PAID";
    } else if (data.paymentOption === "CREDIT") {
      paidAmount = 0;
      paymentStatus = "CREDIT";
    } else {
      paidAmount = data.paidAmount ?? 0;
      paymentStatus = getPaymentStatus(totalAmount, paidAmount);
    }

    const paymentSplits = normalizePaymentSplits(paidAmount, {
      paymentMethod: data.paymentMethod,
      bankAccountId: data.bankAccountId,
      paymentSplits: data.paymentSplits,
    });

    const saleDateFields = resolveSaleDates({
      saleDate: data.saleDate,
      saleDateEthiopian: data.saleDateEthiopian,
    });

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: buildSaleUpdateData({
        clientId,
        shopId: retailShopId,
        totalAmount,
        paidAmount,
        paymentStatus,
        saleDate: saleDateFields.saleDate,
        items: saleItems,
      }),
      include: {
        client: true,
        items: { include: { carton: { include: { product: true } } } },
        payments: { include: { bankAccount: { select: { name: true } } } },
      },
    });

    await persistSaleDateEthiopian(tx, saleId, saleDateFields.saleDateEthiopian);

    if (paymentSplits.length > 0) {
      await createSalePayments(tx, {
        saleId: updated.id,
        saleNumber: updated.saleNumber,
        saleType: SaleType.RETAIL,
        splits: paymentSplits,
        collectedById: session.id,
        retailShopId,
      });
    }

    return updated;
  });
}

export type ShopTransferUpdateInput = {
  shopId: string;
  saleDate?: string;
  saleDateEthiopian?: string;
  saleTime?: string;
  items: {
    cartonId: string;
    cartonsSold: number;
    warehouseLeavingPrice: number;
    retailUnitPrice: number;
  }[];
};

export async function updateShopTransfer(
  session: SessionUser,
  saleId: string,
  data: ShopTransferUpdateInput
) {
  const sale = await getSaleForModify(saleId);
  if (!sale) throw new Error("Sale not found");
  if (sale.type !== SaleType.SHOP_TRANSFER) {
    throw new Error("Only shop transfers can be edited");
  }
  assertCanModifySale(session, sale);

  return prisma.$transaction(async (tx) => {
    await reverseShopTransferStock(tx, sale);
    await clearSaleFinancials(tx, saleId);
    await tx.saleItem.deleteMany({ where: { saleId } });

    let totalAmount = 0;
    const saleItems: {
      cartonId: string;
      cartonsSold: number;
      itemsSold: number;
      unitPrice: number;
      totalPrice: number;
    }[] = [];

    for (const item of data.items) {
      const carton = await tx.carton.findUnique({
        where: { id: item.cartonId },
        include: { product: true },
      });
      if (!carton) throw new Error(`Carton not found: ${item.cartonId}`);
      if (carton.location !== "WAREHOUSE") {
        throw new Error("Shop transfers can only be made from warehouse inventory");
      }

      const itemsMoved = item.cartonsSold * carton.itemsPerCarton;
      const itemTotal = itemsMoved * item.warehouseLeavingPrice;
      totalAmount += itemTotal;

      saleItems.push({
        cartonId: item.cartonId,
        cartonsSold: item.cartonsSold,
        itemsSold: itemsMoved,
        unitPrice: item.warehouseLeavingPrice,
        totalPrice: itemTotal,
      });

      await transferStockToShop(
        tx,
        carton,
        data.shopId,
        item.cartonsSold,
        item.warehouseLeavingPrice,
        item.retailUnitPrice
      );
    }

    const saleDateFields = resolveSaleDates({
      saleDate: data.saleDate,
      saleDateEthiopian: data.saleDateEthiopian,
      saleTime: data.saleTime,
    });

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: {
        shop: { connect: { id: data.shopId } },
        totalAmount,
        saleDate: saleDateFields.saleDate,
        items: { create: saleItems },
      },
      include: {
        shop: { select: { id: true, name: true } },
        items: { include: { carton: { include: { product: true } } } },
      },
    });

    await persistSaleDateEthiopian(tx, saleId, saleDateFields.saleDateEthiopian);

    const shopSalesperson = await getShopSalesperson(tx, data.shopId);
    await tx.salespersonLedger.create({
      data: {
        userId: shopSalesperson.id,
        type: LedgerType.ADJUSTMENT,
        amount: totalAmount,
        description: `Wholesale stock credit ${updated.saleNumber}`,
        saleId: updated.id,
      },
    });

    return updated;
  });
}

export async function getSaleById(session: SessionUser, saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      client: true,
      shop: { select: { id: true, name: true } },
      soldBy: { select: { name: true } },
      retailSoldBy: { select: { name: true } },
      items: {
        include: {
          carton: { include: { product: true } },
        },
      },
      payments: { include: { bankAccount: { select: { name: true, id: true } } } },
    },
  });

  if (!sale) throw new Error("Sale not found");
  assertCanModifySale(session, sale);

  if (isSalesperson(session)) {
    return {
      ...sale,
      saleDateEthiopian: ensureSaleDateEthiopian(sale.saleDate, sale.saleDateEthiopian),
      items: sale.items.map((item) => ({
        ...item,
        carton: {
          id: item.carton.id,
          itemsPerCarton: item.carton.itemsPerCarton,
          product: { name: item.carton.product.name },
        },
      })),
    };
  }

  return {
    ...sale,
    saleDateEthiopian: ensureSaleDateEthiopian(sale.saleDate, sale.saleDateEthiopian),
  };
}
