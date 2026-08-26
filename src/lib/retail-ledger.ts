import { LedgerType, Role, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function getShopSalesperson(tx: Tx, shopId: string) {
  const shopSalesperson = await tx.user.findFirst({
    where: { shopId, role: Role.SALESPERSON, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!shopSalesperson) {
    throw new Error("Assign a salesperson to this shop before recording retail sales");
  }
  return shopSalesperson;
}

export async function recordRetailCollection(
  tx: Tx,
  shopId: string,
  saleId: string,
  paymentId: string,
  amount: number,
  saleNumber: string,
  entryDate = new Date()
) {
  const shopSalesperson = await getShopSalesperson(tx, shopId);

  await tx.salespersonLedger.create({
    data: {
      userId: shopSalesperson.id,
      type: LedgerType.COLLECTION,
      amount,
      description: `Retail collection for sale ${saleNumber}`,
      saleId,
      paymentId,
      entryDate,
    },
  });
}
