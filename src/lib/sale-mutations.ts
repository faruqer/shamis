import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SaleType,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth-edge";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { recordRetailCollection } from "@/lib/retail-ledger";

type Tx = Prisma.TransactionClient;

export type RetailSaleUpdateInput = {
  clientId?: string;
  clientName?: string;
  paymentOption: "PAID" | "CREDIT" | "PARTIAL";
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  saleDate?: string;
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
      throw new Error("Only admins can reverse shop transfers");
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

async function resolveBankAccountId(
  tx: Tx,
  paymentMethod: PaymentMethod | undefined,
  bankAccountId: string | undefined
) {
  if (paymentMethod !== "BANK_TRANSFER") return null;
  if (!bankAccountId) throw new Error("Select a bank for bank transfer");
  const bank = await tx.bankAccount.findFirst({
    where: { id: bankAccountId, isActive: true },
  });
  if (!bank) throw new Error("Invalid or inactive bank selected");
  return bank.id;
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

export async function reverseSale(session: SessionUser, saleId: string) {
  const sale = await getSaleForModify(saleId);
  if (!sale) throw new Error("Sale not found");
  assertCanModifySale(session, sale);

  await prisma.$transaction(async (tx) => {
    if (sale.type === SaleType.SHOP_TRANSFER) {
      await reverseShopTransferStock(tx, sale);
    } else {
      await restoreSaleStock(tx, saleId);
    }
    await clearSaleFinancials(tx, saleId);
    await tx.saleItem.deleteMany({ where: { saleId } });
    await tx.sale.delete({ where: { id: saleId } });
  });
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
    let paymentMethod: PaymentMethod | undefined;

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

    if (paidAmount > 0) {
      if (!data.paymentMethod) throw new Error("Payment method is required when payment is made");
      paymentMethod = data.paymentMethod;
    }

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: {
        clientId,
        shopId: retailShopId,
        totalAmount,
        paidAmount,
        paymentStatus,
        ...(data.saleDate ? { saleDate: new Date(data.saleDate) } : {}),
        items: { create: saleItems },
      },
      include: {
        client: true,
        items: { include: { carton: { include: { product: true } } } },
        payments: { include: { bankAccount: { select: { name: true } } } },
      },
    });

    if (paidAmount > 0) {
      const bankAccountId = await resolveBankAccountId(tx, paymentMethod, data.bankAccountId);
      const payment = await tx.payment.create({
        data: {
          saleId: updated.id,
          amount: paidAmount,
          paymentMethod,
          bankAccountId,
          collectedById: session.id,
        },
      });

      if (retailShopId) {
        await recordRetailCollection(
          tx,
          retailShopId,
          updated.id,
          payment.id,
          paidAmount,
          updated.saleNumber
        );
      }
    }

    return updated;
  });
}

export async function getSaleById(session: SessionUser, saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      client: true,
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

  return sale;
}
