import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber, formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { isSalesperson } from "@/lib/shop-scope";
import { LedgerType, PaymentMethod, Prisma } from "@prisma/client";

const handoverSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().optional(),
  bankAccountId: z.string().optional(),
});

async function resolveBankAccountId(
  tx: Prisma.TransactionClient,
  paymentMethod: PaymentMethod,
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSalesperson(session)) {
      throw new Error("Forbidden");
    }

    const body = await request.json();
    const data = handoverSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.salespersonLedger.findMany({
        where: { userId: session.id },
        select: { amount: true },
      });

      const owedToOwner = entries.reduce((sum, entry) => sum + decimalToNumber(entry.amount), 0);
      if (owedToOwner <= 0) {
        throw new Error(`You have no balance to hand over to ${OWNER_NAME}`);
      }
      if (data.amount > owedToOwner + 0.001) {
        throw new Error(
          `Handover cannot exceed ${formatCurrency(owedToOwner)} owed to ${OWNER_NAME}`
        );
      }

      if (data.paymentMethod === PaymentMethod.BANK_TRANSFER) {
        await resolveBankAccountId(tx, data.paymentMethod, data.bankAccountId);
      }

      let methodLabel = formatPaymentMethod(data.paymentMethod);
      if (data.paymentMethod === PaymentMethod.BANK_TRANSFER && data.bankAccountId) {
        const bank = await tx.bankAccount.findUnique({
          where: { id: data.bankAccountId },
          select: { name: true },
        });
        if (bank?.name) methodLabel = `Bank Transfer (${bank.name})`;
      }

      const descriptionParts = [`Handover to ${OWNER_NAME}`, methodLabel];
      if (data.notes?.trim()) descriptionParts.push(data.notes.trim());

      const entry = await tx.salespersonLedger.create({
        data: {
          userId: session.id,
          type: LedgerType.HANDOVER,
          amount: -data.amount,
          description: descriptionParts.join(" · "),
          entryDate: new Date(),
        },
      });

      return {
        entry,
        ownerCredit: owedToOwner - data.amount,
      };
    });

    return jsonResponse(
      {
        entry: {
          id: result.entry.id,
          type: result.entry.type,
          amount: decimalToNumber(result.entry.amount),
          description: result.entry.description,
          entryDate: result.entry.entryDate,
        },
        ownerCredit: result.ownerCredit,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
