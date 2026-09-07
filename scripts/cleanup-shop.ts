/**
 * Moves any leftover shop stock back to the warehouse and removes empty shop rows.
 *
 * Usage:
 *   npm run db:cleanup:shop -- --confirm
 */
import prisma from "../src/lib/prisma";
import {
  moveRemainingShopStockToWarehouse,
  purgeEmptyShopCartons,
} from "../src/lib/shop-stock";

async function main() {
  const confirm = process.argv.includes("--confirm");

  const remaining = await prisma.carton.findMany({
    where: {
      location: "SHOP",
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    },
    include: { product: { select: { name: true } }, shop: { select: { name: true } } },
  });

  const emptyShells = await prisma.carton.count({
    where: {
      location: "SHOP",
      remainingCartons: 0,
      remainingItems: 0,
    },
  });

  console.log(`Shop stock rows: ${remaining.length}`);
  for (const carton of remaining) {
    console.log(
      `  - ${carton.product.name} @ ${carton.shop?.name ?? "?"}: ${carton.remainingCartons} cartons, ${carton.remainingItems} items`
    );
  }
  console.log(`Empty shop rows to remove: ${emptyShells}`);

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const moved = await moveRemainingShopStockToWarehouse(tx);
    const removed = await purgeEmptyShopCartons(tx);
    return { moved, removed };
  });

  if (result.moved.length > 0) {
    console.log(`\nMoved ${result.moved.length} product(s) back to warehouse:`);
    for (const row of result.moved) {
      console.log(`  ✓ ${row.productName}: ${row.cartons} cartons, ${row.items} items`);
    }
  }

  console.log(`Removed ${result.removed} empty shop row(s).`);
  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
