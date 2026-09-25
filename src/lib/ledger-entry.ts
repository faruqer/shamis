import { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/utils";

/**
 * Everything a ledger row needs to describe itself in words. The stored
 * `description` only carries a sale number, which tells a reader nothing, so
 * every endpoint that returns ledger entries pulls the sale, payment and
 * expense behind them and shapes them identically.
 */
export const LEDGER_ENTRY_INCLUDE = {
  sale: {
    select: {
      id: true,
      saleNumber: true,
      type: true,
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      paymentStatus: true,
      client: { select: { name: true } },
      shop: { select: { name: true } },
      items: {
        select: {
          cartonsSold: true,
          itemsSold: true,
          unitPrice: true,
          totalPrice: true,
          carton: {
            select: {
              itemsPerCarton: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  payment: {
    select: {
      amount: true,
      paymentMethod: true,
      paymentDate: true,
      notes: true,
      bankAccount: { select: { name: true } },
    },
  },
  expense: {
    select: {
      description: true,
      category: true,
      bankAccount: { select: { name: true } },
    },
  },
} satisfies Prisma.SalespersonLedgerInclude;

type LedgerEntryWithRelations = Prisma.SalespersonLedgerGetPayload<{
  include: typeof LEDGER_ENTRY_INCLUDE;
}>;

export function shapeLedgerEntry(entry: LedgerEntryWithRelations) {
  return {
    id: entry.id,
    type: entry.type,
    amount: decimalToNumber(entry.amount),
    description: entry.description,
    entryDate: entry.entryDate,
    sale: entry.sale
      ? {
          id: entry.sale.id,
          saleNumber: entry.sale.saleNumber,
          type: entry.sale.type,
          saleDate: entry.sale.saleDate,
          totalAmount: decimalToNumber(entry.sale.totalAmount),
          paidAmount: decimalToNumber(entry.sale.paidAmount),
          paymentStatus: entry.sale.paymentStatus,
          clientName: entry.sale.client?.name ?? null,
          shopName: entry.sale.shop?.name ?? null,
          items: entry.sale.items.map((item) => ({
            productName: item.carton.product.name,
            cartonsSold: item.cartonsSold,
            itemsSold: item.itemsSold,
            itemsPerCarton: item.carton.itemsPerCarton,
            unitPrice: decimalToNumber(item.unitPrice),
            totalPrice: decimalToNumber(item.totalPrice),
          })),
        }
      : null,
    payment: entry.payment
      ? {
          amount: decimalToNumber(entry.payment.amount),
          paymentMethod: entry.payment.paymentMethod,
          paymentDate: entry.payment.paymentDate,
          notes: entry.payment.notes,
          bankName: entry.payment.bankAccount?.name ?? null,
        }
      : null,
    expense: entry.expense
      ? {
          description: entry.expense.description,
          category: entry.expense.category,
          bankName: entry.expense.bankAccount?.name ?? null,
        }
      : null,
  };
}
