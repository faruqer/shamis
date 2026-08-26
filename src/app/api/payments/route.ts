import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { LedgerType, PaymentMethod, PaymentStatus, Prisma, SaleType } from "@prisma/client";
import { recordRetailCollection } from "@/lib/retail-ledger";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { decimalToNumber } from "@/lib/utils";

const paymentSchema = z
  .object({
    saleId: z.string().optional(),
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    amount: z.number().positive(),
    notes: z.string().optional(),
    salespersonId: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    bankAccountId: z.string().optional(),
  })
  .refine((data) => data.saleId || data.clientId || data.clientName, {
    message: "Either saleId, clientId, or clientName is required",
  });

async function resolveBankAccountId(
  tx: Prisma.TransactionClient,
  paymentMethod: PaymentMethod | undefined,
  bankAccountId: string | undefined
) {
  if (paymentMethod !== PaymentMethod.BANK_TRANSFER) return null;
  if (!bankAccountId) throw new Error("Select a bank for bank transfer");
  const bank = await tx.bankAccount.findFirst({
    where: { id: bankAccountId, isActive: true },
  });
  if (!bank) throw new Error("Invalid or inactive bank selected");
  return bank.id;
}

function getPaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid >= total - 0.001) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "CREDIT";
}

async function applyPaymentToSale(
  tx: Prisma.TransactionClient,
  sale: {
    id: string;
    type: SaleType;
    shopId: string | null;
    saleNumber: string;
    totalAmount: { toString(): string };
    paidAmount: { toString(): string };
  },
  amount: number,
  salespersonId: string,
  paymentMethod: PaymentMethod | undefined,
  bankAccountId: string | null,
  notes: string | undefined
) {
  const totalAmount = decimalToNumber(sale.totalAmount);
  const currentPaid = decimalToNumber(sale.paidAmount);
  const outstanding = totalAmount - currentPaid;

  if (outstanding <= 0) return 0;

  const applied = Math.min(amount, outstanding);
  const newPaidAmount = currentPaid + applied;
  const paymentStatus = getPaymentStatus(totalAmount, newPaidAmount);

  const payment = await tx.payment.create({
    data: {
      saleId: sale.id,
      amount: applied,
      notes,
      paymentMethod,
      bankAccountId,
      collectedById: salespersonId,
    },
  });

  await tx.sale.update({
    where: { id: sale.id },
    data: { paidAmount: newPaidAmount, paymentStatus },
  });

  if (sale.type === SaleType.WHOLESALE) {
    await tx.salespersonLedger.create({
      data: {
        userId: salespersonId,
        type: LedgerType.COLLECTION,
        amount: applied,
        description: `Wholesale payment for sale ${sale.saleNumber}`,
        saleId: sale.id,
        paymentId: payment.id,
      },
    });
  }

  if (sale.type === SaleType.RETAIL && sale.shopId) {
    await recordRetailCollection(
      tx,
      sale.shopId,
      sale.id,
      payment.id,
      applied,
      sale.saleNumber,
      payment.paymentDate
    );
  }

  return applied;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const data = paymentSchema.parse(body);

    const salespersonId = data.salespersonId || session.id;

    if (isSalesperson(session) && !data.paymentMethod) {
      throw new Error("Payment method is required");
    }

    const result = await prisma.$transaction(async (tx) => {
      const bankAccountId = await resolveBankAccountId(
        tx,
        data.paymentMethod,
        data.bankAccountId
      );

      if (data.clientId || data.clientName) {
        const shopId = isSalesperson(session) ? requireSalespersonShopId(session) : undefined;

        const unpaidSales = await tx.sale.findMany({
          where: {
            ...(data.clientId ? { clientId: data.clientId } : {}),
            ...(data.clientName && !data.clientId
              ? { client: { name: data.clientName.trim() } }
              : {}),
            paymentStatus: { in: ["CREDIT", "PARTIAL"] },
            ...(isSalesperson(session)
              ? {
                  type: SaleType.RETAIL,
                  shopId,
                }
              : {}),
          },
          orderBy: { saleDate: "asc" },
        });

        const salesWithOutstanding = unpaidSales.filter((sale) => {
          const outstanding =
            decimalToNumber(sale.totalAmount) - decimalToNumber(sale.paidAmount);
          return outstanding > 0;
        });

        if (salesWithOutstanding.length === 0) {
          throw new Error("This client has no unpaid credit sales");
        }

        const totalOutstanding = salesWithOutstanding.reduce(
          (sum, sale) =>
            sum + (decimalToNumber(sale.totalAmount) - decimalToNumber(sale.paidAmount)),
          0
        );

        if (data.amount > totalOutstanding + 0.001) {
          throw new Error(
            `Payment cannot exceed outstanding credit of ${totalOutstanding.toFixed(2)}`
          );
        }

        let remaining = data.amount;
        const payments = [];

        for (const sale of salesWithOutstanding) {
          if (remaining <= 0) break;

          const applied = await applyPaymentToSale(
            tx,
            sale,
            remaining,
            salespersonId,
            data.paymentMethod,
            bankAccountId,
            data.notes
          );

          if (applied > 0) {
            payments.push({ saleId: sale.id, amount: applied });
            remaining -= applied;
          }
        }

        return { allocations: payments, totalApplied: data.amount - remaining };
      }

      if (!data.saleId) {
        throw new Error("Either saleId or clientId is required");
      }

      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: {
          items: { include: { carton: { select: { shopId: true } } } },
        },
      });
      if (!sale) throw new Error("Sale not found");

      if (isSalesperson(session)) {
        if (sale.type !== SaleType.RETAIL) {
          throw new Error("You can only record payments for retail sales");
        }
        const shopId = requireSalespersonShopId(session);
        if (sale.shopId !== shopId) {
          throw new Error("This sale does not belong to your shop");
        }
      }

      const totalAmount = decimalToNumber(sale.totalAmount);
      const currentPaid = decimalToNumber(sale.paidAmount);
      const outstanding = totalAmount - currentPaid;

      if (outstanding <= 0) {
        throw new Error("This sale has no outstanding credit");
      }
      if (data.amount > outstanding + 0.001) {
        throw new Error(`Payment cannot exceed outstanding credit of ${outstanding.toFixed(2)}`);
      }

      const applied = await applyPaymentToSale(
        tx,
        sale,
        data.amount,
        salespersonId,
        data.paymentMethod,
        bankAccountId,
        data.notes
      );

      return { allocations: [{ saleId: sale.id, amount: applied }], totalApplied: applied };
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
