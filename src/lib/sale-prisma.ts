import type { PaymentStatus, SaleType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

type SaleItemCreate = {
  cartonId: string;
  cartonsSold: number;
  itemsSold: number;
  unitPrice: number;
  totalPrice: number;
};

export function buildSaleCreateData(input: {
  saleNumber: string;
  type: SaleType;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  saleDate?: Date;
  clientId?: string;
  shopId?: string;
  soldById?: string;
  retailSoldById?: string;
  items: SaleItemCreate[];
}): Prisma.SaleCreateInput {
  const data: Prisma.SaleCreateInput = {
    saleNumber: input.saleNumber,
    type: input.type,
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    paymentStatus: input.paymentStatus,
    items: { create: input.items },
  };

  if (input.saleDate) data.saleDate = input.saleDate;
  if (input.clientId) data.client = { connect: { id: input.clientId } };
  if (input.shopId) data.shop = { connect: { id: input.shopId } };
  if (input.soldById) data.soldBy = { connect: { id: input.soldById } };
  if (input.retailSoldById) data.retailSoldBy = { connect: { id: input.retailSoldById } };

  return data;
}

export function buildSaleUpdateData(input: {
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  saleDate: Date;
  clientId: string;
  shopId?: string;
  items: SaleItemCreate[];
}): Prisma.SaleUpdateInput {
  const data: Prisma.SaleUpdateInput = {
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    paymentStatus: input.paymentStatus,
    saleDate: input.saleDate,
    client: { connect: { id: input.clientId } },
    items: { create: input.items },
  };

  if (input.shopId) data.shop = { connect: { id: input.shopId } };

  return data;
}

/** Persist EC date even when Prisma client/engine is briefly out of sync after schema changes. */
export async function persistSaleDateEthiopian(
  tx: Pick<Prisma.TransactionClient, "sale" | "$executeRaw">,
  saleId: string,
  saleDateEthiopian: string
) {
  try {
    await tx.sale.update({
      where: { id: saleId },
      data: { saleDateEthiopian },
    });
  } catch {
    await tx.$executeRaw`UPDATE Sale SET saleDateEthiopian = ${saleDateEthiopian} WHERE id = ${saleId}`;
  }
}
