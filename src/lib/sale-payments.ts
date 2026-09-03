import { LedgerType, PaymentMethod, Prisma, SaleType } from "@prisma/client";
import { recordRetailCollection } from "@/lib/retail-ledger";

type Tx = Prisma.TransactionClient;

export type PaymentSplitInput = {
  paymentMethod: PaymentMethod;
  amount: number;
  bankAccountId?: string;
};

export async function resolveBankAccountId(
  tx: Tx,
  paymentMethod: PaymentMethod,
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

export function normalizePaymentSplits(
  paidAmount: number,
  options: {
    paymentMethod?: PaymentMethod;
    bankAccountId?: string;
    paymentSplits?: PaymentSplitInput[];
  }
): PaymentSplitInput[] {
  if (paidAmount <= 0) return [];

  if (options.paymentSplits?.length) {
    const total = options.paymentSplits.reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(total - paidAmount) > 0.009) {
      throw new Error("Payment amounts must add up to the amount paid");
    }
    return options.paymentSplits;
  }

  if (!options.paymentMethod) {
    throw new Error("Payment method is required when payment is made");
  }

  return [
    {
      paymentMethod: options.paymentMethod,
      amount: paidAmount,
      bankAccountId: options.bankAccountId,
    },
  ];
}

export async function createSalePayments(
  tx: Tx,
  input: {
    saleId: string;
    saleNumber: string;
    saleType: SaleType;
    splits: PaymentSplitInput[];
    collectedById: string;
    retailShopId?: string;
    wholesaleSalespersonId?: string;
  }
) {
  for (const split of input.splits) {
    const bankAccountId = await resolveBankAccountId(
      tx,
      split.paymentMethod,
      split.bankAccountId
    );

    const payment = await tx.payment.create({
      data: {
        saleId: input.saleId,
        amount: split.amount,
        paymentMethod: split.paymentMethod,
        bankAccountId,
        collectedById: input.collectedById,
      },
    });

    if (input.saleType === "WHOLESALE" && input.wholesaleSalespersonId) {
      await tx.salespersonLedger.create({
        data: {
          userId: input.wholesaleSalespersonId,
          type: LedgerType.COLLECTION,
          amount: split.amount,
          description: `Wholesale payment for sale ${input.saleNumber}`,
          saleId: input.saleId,
          paymentId: payment.id,
        },
      });
    }

    if (input.saleType === "RETAIL" && input.retailShopId) {
      await recordRetailCollection(
        tx,
        input.retailShopId,
        input.saleId,
        payment.id,
        split.amount,
        input.saleNumber
      );
    }
  }
}
