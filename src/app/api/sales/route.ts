import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { generateSaleNumber, decimalToNumber } from "@/lib/utils";
import { LedgerType, PaymentMethod, PaymentStatus, SaleType, Role } from "@prisma/client";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { recordRetailCollection } from "@/lib/retail-ledger";

const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHECK", "OTHER"]);

const wholesaleRetailItemSchema = z.object({
  cartonId: z.string(),
  cartonsSold: z.number().int().min(0).optional(),
  itemsSold: z.number().int().min(0).optional(),
  unitPrice: z.number().positive(),
});

const shopTransferItemSchema = z.object({
  cartonId: z.string(),
  cartonsSold: z.number().int().positive(),
  warehouseLeavingPrice: z.number().positive(),
  retailUnitPrice: z.number().positive(),
});

const saleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SHOP_TRANSFER"),
    shopId: z.string(),
    items: z.array(shopTransferItemSchema).min(1),
  }),
  z.object({
    type: z.literal("WHOLESALE"),
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    items: z.array(wholesaleRetailItemSchema).min(1),
    paymentOption: z.enum(["PAID", "CREDIT", "PARTIAL"]),
    paidAmount: z.number().min(0).optional(),
    paymentMethod: paymentMethodSchema.optional(),
    bankAccountId: z.string().optional(),
    salespersonId: z.string().optional(),
  }),
  z.object({
    type: z.literal("RETAIL"),
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    items: z.array(wholesaleRetailItemSchema).min(1),
    paymentOption: z.enum(["PAID", "CREDIT", "PARTIAL"]),
    paidAmount: z.number().min(0).optional(),
    paymentMethod: paymentMethodSchema.optional(),
    bankAccountId: z.string().optional(),
  }),
]);

async function resolveBankAccountId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
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

async function getShopSalesperson(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  shopId: string
) {
  const shopSalesperson = await tx.user.findFirst({
    where: {
      shopId,
      role: Role.SALESPERSON,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!shopSalesperson) {
    throw new Error("Assign a salesperson to this shop before transferring stock");
  }

  return shopSalesperson;
}

async function transferStockToShop(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  carton: {
    id: string;
    productId: string;
    cartonNumber: string;
    itemsPerCarton: number;
    remainingCartons: number;
    remainingItems: number;
  },
  shopId: string,
  cartonsToTransfer: number,
  warehouseLeavingPrice: number,
  retailUnitPrice: number
) {
  const itemsMoved = cartonsToTransfer * carton.itemsPerCarton;

  if (cartonsToTransfer > carton.remainingCartons) {
    throw new Error("Not enough cartons to transfer");
  }

  const shop = await tx.shop.findUnique({ where: { id: shopId } });
  if (!shop || !shop.isActive) {
    throw new Error("Shop not found");
  }

  const newRemainingCartons = carton.remainingCartons - cartonsToTransfer;
  const newRemainingItems = carton.remainingItems - itemsMoved;

  const priceData = {
    warehouseLeavingPrice,
    retailUnitPrice,
  };

  if (cartonsToTransfer === carton.remainingCartons && newRemainingItems === 0) {
    await tx.carton.update({
      where: { id: carton.id },
      data: {
        location: "SHOP",
        shopId,
        ...priceData,
      },
    });
    return;
  }

  await tx.carton.update({
    where: { id: carton.id },
    data: {
      remainingCartons: newRemainingCartons,
      remainingItems: newRemainingItems,
    },
  });

  const shopCarton = await tx.carton.findFirst({
    where: { productId: carton.productId, location: "SHOP", shopId },
  });

  if (shopCarton) {
    await tx.carton.update({
      where: { id: shopCarton.id },
      data: {
        remainingCartons: shopCarton.remainingCartons + cartonsToTransfer,
        remainingItems: shopCarton.remainingItems + itemsMoved,
        totalCartons: shopCarton.totalCartons + cartonsToTransfer,
        ...priceData,
      },
    });
  } else {
    await tx.carton.create({
      data: {
        productId: carton.productId,
        cartonNumber: `${carton.cartonNumber}-shop-${shopId.slice(-8)}`,
        itemsPerCarton: carton.itemsPerCarton,
        totalCartons: cartonsToTransfer,
        remainingCartons: cartonsToTransfer,
        remainingItems: itemsMoved,
        location: "SHOP",
        shopId,
        ...priceData,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const where: {
      type?: SaleType;
      items?: { some: { carton: { shopId: string } } };
    } = {};

    if (isSalesperson(session)) {
      const shopId = requireSalespersonShopId(session);
      where.type = "RETAIL";
      where.items = { some: { carton: { shopId } } };
    } else if (type) {
      where.type = type as SaleType;
    }

    const sales = await prisma.sale.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        client: true,
        soldBy: { select: { name: true } },
        retailSoldBy: { select: { name: true } },
        items: {
          include: {
            carton: {
              include: { product: true },
            },
          },
        },
        payments: { include: { bankAccount: { select: { name: true } } } },
      },
      orderBy: { saleDate: "desc" },
    });

    if (isSalesperson(session)) {
      const sanitized = sales.map((sale) => ({
        ...sale,
        items: sale.items.map((item) => ({
          ...item,
          carton: {
            itemsPerCarton: item.carton.itemsPerCarton,
            product: { name: item.carton.product.name },
          },
        })),
      }));
      return jsonResponse(sanitized);
    }

    return jsonResponse(sales);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const data = saleSchema.parse(body);

    if (data.type === "WHOLESALE") {
      if (session.role !== Role.ADMIN) {
        throw new Error("Forbidden");
      }
    }

    if (data.type === "SHOP_TRANSFER") {
      if (session.role === Role.SALESPERSON) {
        const { isWarehouseLocked } = await import("@/lib/settings");
        if (await isWarehouseLocked()) {
          throw new Error("Warehouse is locked. Contact admin to unlock stock management.");
        }
        const shopId = requireSalespersonShopId(session);
        if (data.shopId !== shopId) {
          throw new Error("You can only transfer stock to your assigned shop");
        }
      } else if (session.role !== Role.ADMIN) {
        throw new Error("Forbidden");
      }
    }

    const salespersonShopId =
      data.type === "SHOP_TRANSFER" && session.role === Role.SALESPERSON
        ? requireSalespersonShopId(session)
        : undefined;

    const prefix =
      data.type === "WHOLESALE" ? "WS" : data.type === "SHOP_TRANSFER" ? "ST" : "RT";

    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const saleItems: {
        cartonId: string;
        cartonsSold: number;
        itemsSold: number;
        unitPrice: number;
        totalPrice: number;
      }[] = [];

      if (data.type === "SHOP_TRANSFER") {
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
            salespersonShopId ?? data.shopId,
            item.cartonsSold,
            item.warehouseLeavingPrice,
            item.retailUnitPrice
          );
        }

        const transferShopId = salespersonShopId ?? data.shopId;

        const sale = await tx.sale.create({
          data: {
            saleNumber: generateSaleNumber(prefix),
            type: "SHOP_TRANSFER",
            shopId: transferShopId,
            totalAmount,
            paidAmount: 0,
            paymentStatus: "CREDIT",
            soldById: session.id,
            items: { create: saleItems },
          },
          include: {
            items: { include: { carton: { include: { product: true } } } },
          },
        });

        const shopSalesperson = await getShopSalesperson(tx, transferShopId);

        await tx.salespersonLedger.create({
          data: {
            userId: shopSalesperson.id,
            type: LedgerType.ADJUSTMENT,
            amount: totalAmount,
            description: `Wholesale stock credit ${sale.saleNumber}`,
            saleId: sale.id,
          },
        });

        return sale;
      }

      let clientId: string | undefined =
        data.type === "WHOLESALE" || data.type === "RETAIL" ? data.clientId : undefined;

      if (data.type === "WHOLESALE") {
        if (!clientId && data.clientName) {
          const client = await tx.client.create({ data: { name: data.clientName.trim() } });
          clientId = client.id;
        }
        if (!clientId) {
          throw new Error("Client is required");
        }
      }

      if (data.type === "RETAIL") {
        if (!clientId && data.clientName) {
          const client = await tx.client.create({ data: { name: data.clientName.trim() } });
          clientId = client.id;
        }
        if (!clientId) {
          throw new Error("Client is required");
        }
      }

      let retailShopId: string | undefined;

      for (const item of data.items) {
        const carton = await tx.carton.findUnique({
          where: { id: item.cartonId },
          include: { product: true },
        });
        if (!carton) throw new Error(`Carton not found: ${item.cartonId}`);

        if (data.type === "RETAIL" && carton.shopId) {
          retailShopId = carton.shopId;
        }

        const cartonsSold = item.cartonsSold || 0;
        const itemsSold = item.itemsSold || 0;

        if (cartonsSold === 0 && itemsSold === 0) {
          throw new Error("Each line must have cartons or items quantity");
        }

        if (data.type === "RETAIL" && carton.location !== "SHOP") {
          throw new Error("Retail sales can only be made from shop inventory");
        }
        if (data.type === "WHOLESALE" && carton.location !== "WAREHOUSE") {
          throw new Error("Wholesale sales can only be made from warehouse inventory");
        }
        if (data.type === "RETAIL" && isSalesperson(session)) {
          const shopId = requireSalespersonShopId(session);
          if (carton.shopId !== shopId) {
            throw new Error("You can only sell stock from your assigned shop");
          }
        }
        if (data.type === "WHOLESALE") {
          if (cartonsSold <= 0) throw new Error("Wholesale sales must be sold in cartons");
          if (itemsSold > 0) throw new Error("Wholesale sales must be sold in cartons");
        }

        if (cartonsSold > carton.remainingCartons) {
          throw new Error(`Not enough cartons for ${carton.product.name}`);
        }

        const itemsQuantity =
          data.type === "RETAIL"
            ? cartonsSold * carton.itemsPerCarton + itemsSold
            : itemsSold > 0
              ? itemsSold
              : cartonsSold * carton.itemsPerCarton;

        if (data.type === "RETAIL") {
          if (itemsQuantity <= 0) {
            throw new Error("Each line must include at least one carton or item");
          }
          if (itemsQuantity > carton.remainingItems) {
            throw new Error(`Not enough stock for ${carton.product.name}`);
          }
        } else if (itemsSold > carton.remainingItems) {
          throw new Error(`Not enough items for ${carton.product.name}`);
        }

        const itemTotal =
          data.type === "WHOLESALE"
            ? cartonsSold * carton.itemsPerCarton * item.unitPrice
            : data.type === "RETAIL"
              ? itemsQuantity * item.unitPrice
              : cartonsSold > 0
                ? cartonsSold * item.unitPrice
                : itemsSold * item.unitPrice;

        totalAmount += itemTotal;
        saleItems.push({
          cartonId: item.cartonId,
          cartonsSold,
          itemsSold,
          unitPrice: item.unitPrice,
          totalPrice: itemTotal,
        });

        if (data.type === "RETAIL") {
          const wholesaleUnit = decimalToNumber(carton.warehouseLeavingPrice);
          if (wholesaleUnit <= 0) {
            throw new Error(`Missing wholesale price for ${carton.product.name}. Re-transfer stock to the shop first.`);
          }
        }

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

      if (data.type === "WHOLESALE" || data.type === "RETAIL") {
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
      } else {
        paidAmount = 0;
        paymentStatus = "PAID";
      }

      let salespersonId = session.id;
      if (data.type === "WHOLESALE") {
        salespersonId = data.salespersonId || session.id;
      }

      const sale = await tx.sale.create({
        data: {
          saleNumber: generateSaleNumber(prefix),
          type: data.type as SaleType,
          clientId,
          shopId: data.type === "RETAIL" ? retailShopId : undefined,
          totalAmount,
          paidAmount,
          paymentStatus,
          soldById: data.type === "WHOLESALE" ? salespersonId : undefined,
          retailSoldById: data.type === "RETAIL" ? session.id : undefined,
          items: { create: saleItems },
        },
        include: {
          client: true,
          items: { include: { carton: { include: { product: true } } } },
        },
      });

      if (paidAmount > 0) {
        const bankAccountId = await resolveBankAccountId(
          tx,
          paymentMethod,
          data.type === "WHOLESALE" || data.type === "RETAIL" ? data.bankAccountId : undefined
        );

        const payment = await tx.payment.create({
          data: {
            saleId: sale.id,
            amount: paidAmount,
            paymentMethod,
            bankAccountId,
            collectedById: data.type === "RETAIL" ? session.id : salespersonId,
          },
        });

        if (data.type === "WHOLESALE") {
          await tx.salespersonLedger.create({
            data: {
              userId: salespersonId,
              type: LedgerType.COLLECTION,
              amount: paidAmount,
              description: `Wholesale payment for sale ${sale.saleNumber}`,
              saleId: sale.id,
              paymentId: payment.id,
            },
          });
        }

        if (data.type === "RETAIL" && retailShopId) {
          await recordRetailCollection(
            tx,
            retailShopId,
            sale.id,
            payment.id,
            paidAmount,
            sale.saleNumber
          );
        }
      }

      return sale;
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
