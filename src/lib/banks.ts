import { Prisma } from "@prisma/client";

export async function resolveBankAccountId(
  tx: Prisma.TransactionClient,
  bankAccountId: string | undefined
) {
  if (!bankAccountId) throw new Error("Select a bank account");
  const bank = await tx.bankAccount.findFirst({
    where: { id: bankAccountId, isActive: true },
  });
  if (!bank) throw new Error("Invalid or inactive bank selected");
  return bank.id;
}
