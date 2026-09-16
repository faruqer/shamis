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
import {
  getShopSalesperson,
  getUniqueCartonNumber,
  isImportOriginalCarton,
  retailStockAfterRestore,
  retailStockAfterSale,
  transferStockToShop,
} from "@/lib/shop-stock";
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

type RestorableSale = {
  id: string;
  type: SaleType;
  shopId: string | null;
};

/** Put sold stock back where it came from: warehouse for wholesale, the sale's shop for retail. */
async function restoreSaleStock(tx: Tx, sale: RestorableSale) {
  const items = await tx.saleItem.findMany({
    where: { saleId: sale.id },
    select: { cartonId: true, cartonsSold: true, itemsSold: true },
  });

  for (const item of items) {
    // Re-read each time: the same carton can appear on more than one line.
    const carton = await tx.carton.findUnique({
      where: { id: item.cartonId },
      include: { product: { select: { name: true } } },
    });
    if (!carton) throw new Error("Carton not found");

    if (sale.type === SaleType.RETAIL) {
      await restoreRetailItem(tx, sale, carton, item);
      continue;
    }

    const moved = item.cartonsSold * carton.itemsPerCarton + item.itemsSold;
    if (carton.location === "WAREHOUSE") {
      await tx.carton.update({
        where: { id: carton.id },
        data: {
          remainingCartons: carton.remainingCartons + item.cartonsSold,
          remainingItems: carton.remainingItems + moved,
        },
      });
    } else {
      // The source carton has since been moved to a shop; wholesale stock belongs in the warehouse.
      await addStockToWarehouse(tx, carton, item.cartonsSold, moved);
    }
  }
}

async function restoreRetailItem(
  tx: Tx,
  sale: RestorableSale,
  carton: {
    id: string;
    productId: string;
    location: string;
    shopId: string | null;
    itemsPerCarton: number;
    remainingCartons: number;
    remainingItems: number;
    product: { name: string };
  },
  item: { cartonsSold: number; itemsSold: number }
) {
  const shopId = sale.shopId ?? carton.shopId;
  let target =
    carton.location === "SHOP" && carton.shopId === shopId ? carton : null;

  if (!target && shopId) {
    target = await tx.carton.findFirst({
      where: {
        productId: carton.productId,
        location: "SHOP",
        shopId,
        itemsPerCarton: carton.itemsPerCarton,
      },
      orderBy: [{ remainingItems: "desc" }, { createdAt: "asc" }],
      include: { product: { select: { name: true } } },
    });
  }

  if (!target) {
    throw new Error(
      `Cannot reverse this sale: "${carton.product.name}" is no longer stocked in this shop`
    );
  }

  await tx.carton.update({
    where: { id: target.id },
    data: retailStockAfterRestore(target, item.cartonsSold, item.itemsSold),
  });
}

async function findShopCartonsWithStock(
  tx: Tx,
  productId: string,
  shopId: string
) {
  return tx.carton.findMany({
    where: {
      productId,
      location: "SHOP",
      shopId,
      remainingCartons: { gt: 0 },
    },
    orderBy: [{ remainingCartons: "desc" }, { createdAt: "asc" }],
  });
}

/** Full cartons that are really available (loose-item sales may have opened some). */
function fullCartonsAvailable(carton: {
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
}) {
  return Math.max(
    0,
    Math.min(carton.remainingCartons, Math.floor(carton.remainingItems / carton.itemsPerCarton))
  );
}

async function deductShopCartons(
  tx: Tx,
  shopCartons: {
    id: string;
    cartonNumber: string;
    itemsPerCarton: number;
    remainingCartons: number;
    remainingItems: number;
    totalCartons: number;
  }[],
  cartonsToRemove: number
) {
  let cartonsLeft = cartonsToRemove;
  let itemsMoved = 0;

  for (const shopCarton of shopCartons) {
    if (cartonsLeft <= 0) break;

    const take = Math.min(cartonsLeft, fullCartonsAvailable(shopCarton));
    if (take <= 0) continue;

    const itemsTake = take * shopCarton.itemsPerCarton;
    itemsMoved += itemsTake;
    cartonsLeft -= take;

    await tx.carton.update({
      where: { id: shopCarton.id },
      data: {
        remainingCartons: shopCarton.remainingCartons - take,
        remainingItems: shopCarton.remainingItems - itemsTake,
        ...(isImportOriginalCarton(shopCarton)
          ? {}
          : { totalCartons: Math.max(0, shopCarton.totalCartons - take) }),
      },
    });
  }

  return {
    cartonsRemoved: cartonsToRemove - cartonsLeft,
    itemsMoved,
  };
}

async function addStockToWarehouse(
  tx: Tx,
  source: {
    id: string;
    productId: string;
    cartonNumber: string;
    itemsPerCarton: number;
    location: string;
  },
  cartonsAdded: number,
  itemsAdded: number
) {
  const warehouseCarton =
    source.location === "WAREHOUSE"
      ? await tx.carton.findUnique({ where: { id: source.id } })
      : await tx.carton.findFirst({
          where: {
            productId: source.productId,
            location: "WAREHOUSE",
            itemsPerCarton: source.itemsPerCarton,
          },
          orderBy: { createdAt: "asc" },
        });

  if (warehouseCarton) {
    await tx.carton.update({
      where: { id: warehouseCarton.id },
      data: {
        remainingCartons: warehouseCarton.remainingCartons + cartonsAdded,
        remainingItems: warehouseCarton.remainingItems + itemsAdded,
      },
    });
    return;
  }

  // No warehouse row left for this product: create one instead of moving a shop row,
  // so retail sales that point at the shop row still reverse into the shop.
  await tx.carton.create({
    data: {
      productId: source.productId,
      cartonNumber: await getUniqueCartonNumber(
        tx,
        source.productId,
        `${source.cartonNumber.replace(/-shop-[a-z0-9]+$/i, "")}-ret`
      ),
      itemsPerCarton: source.itemsPerCarton,
      totalCartons: cartonsAdded,
      remainingCartons: cartonsAdded,
      remainingItems: itemsAdded,
      location: "WAREHOUSE",
    },
  });
}

async function reverseShopTransferStock(
  tx: Tx,
  sale: {
    shopId: string | null;
    items: { cartonId: string; cartonsSold: number; itemsSold: number }[];
  },
  force = false
) {
  if (!sale.shopId) throw new Error("Transfer shop not found");

  for (const item of sale.items) {
    let cartonsToReverse = item.cartonsSold;

    const carton = await tx.carton.findUnique({
      where: { id: item.cartonId },
      include: { product: { select: { name: true } } },
    });
    if (!carton) throw new Error("Carton not found");

    const productName = carton.product.name;
    const shopCartons = await findShopCartonsWithStock(tx, carton.productId, sale.shopId);
    const available = shopCartons.reduce((sum, c) => sum + fullCartonsAvailable(c), 0);

    if (available < cartonsToReverse) {
      if (!force) {
        throw new Error(
          `Cannot reverse transfer for "${productName}": not enough full cartons left in the shop (some may have been sold or returned)`
        );
      }
      cartonsToReverse = available;
      if (cartonsToReverse === 0) continue;
    }

    const { cartonsRemoved, itemsMoved } = await deductShopCartons(
      tx,
      shopCartons,
      cartonsToReverse
    );

    if (cartonsRemoved === 0) {
      if (force) continue;
      throw new Error(`Shop stock not found for "${productName}"`);
    }

    await addStockToWarehouse(tx, carton, cartonsRemoved, itemsMoved);
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

export async function reverseSaleInTransaction(
  tx: Tx,
  sale: SaleForReverse,
  options?: { force?: boolean }
) {
  if (sale.type === SaleType.SHOP_TRANSFER) {
    await reverseShopTransferStock(tx, sale, options?.force);
  } else {
    await restoreSaleStock(tx, sale);
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

export async function resetSalesByTypes(
  types: SaleType[] = RESET_SALE_TYPES,
  options?: { force?: boolean }
) {
  const results: {
    reversed: string[];
    failed: { saleNumber: string; error: string }[];
    forced: string[];
  } = {
    reversed: [],
    failed: [],
    forced: [],
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
          await reverseSaleInTransaction(tx, sale, { force: options?.force });
        });
        results.reversed.push(sale.saleNumber);
      } catch (error) {
        if (options?.force) {
          results.failed.push({
            saleNumber: sale.saleNumber,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          continue;
        }

        try {
          await prisma.$transaction(async (tx) => {
            await reverseSaleInTransaction(tx, sale, { force: true });
          });
          results.reversed.push(sale.saleNumber);
          results.forced.push(sale.saleNumber);
        } catch (retryError) {
          results.failed.push({
            saleNumber: sale.saleNumber,
            error: retryError instanceof Error ? retryError.message : "Unknown error",
          });
        }
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
    await restoreSaleStock(tx, sale);
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
      costPrice: number;
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
        costPrice: wholesaleUnit,
      });

      if (carton.shopId) retailShopId = carton.shopId;

      await tx.carton.update({
        where: { id: item.cartonId },
        data: retailStockAfterSale(carton, cartonsSold, itemsSold),
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
      if (paidAmount > totalAmount + 0.001) {
        throw new Error("Amount paid cannot be more than the sale total");
      }
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
      costPrice: number;
    }[] = [];

    for (const item of data.items) {
      let carton = await tx.carton.findUnique({
        where: { id: item.cartonId },
        include: { product: true },
      });
      if (!carton) throw new Error(`Carton not found: ${item.cartonId}`);
      if (carton.location !== "WAREHOUSE") {
        // The original row may have moved to the shop in full; its stock is back in a warehouse row now.
        carton = await tx.carton.findFirst({
          where: {
            productId: carton.productId,
            location: "WAREHOUSE",
            itemsPerCarton: carton.itemsPerCarton,
            remainingCartons: { gte: item.cartonsSold },
          },
          orderBy: { createdAt: "asc" },
          include: { product: true },
        });
        if (!carton) {
          throw new Error("Shop transfers can only be made from warehouse inventory");
        }
      }

      const itemsMoved = item.cartonsSold * carton.itemsPerCarton;
      const itemTotal = itemsMoved * item.warehouseLeavingPrice;
      totalAmount += itemTotal;

      saleItems.push({
        cartonId: carton.id,
        cartonsSold: item.cartonsSold,
        itemsSold: itemsMoved,
        unitPrice: item.warehouseLeavingPrice,
        totalPrice: itemTotal,
        costPrice: decimalToNumber(carton.product.unitCost),
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
        costPrice: undefined, // cost is admin-only
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
