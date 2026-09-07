/**
 * Full server cleanup: reset all sales, move leftover shop stock to warehouse,
 * remove empty shop rows. Runs up to 2 passes for stubborn transfers.
 *
 * Usage:
 *   npm run db:clean:server              # dry run
 *   npm run db:clean:server -- --confirm # apply
 */
import { SaleType } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { resetSalesByTypes } from "../src/lib/sale-mutations";
import {
  moveRemainingShopStockToWarehouse,
  purgeEmptyShopCartons,
} from "../src/lib/shop-stock";

const TYPES: SaleType[] = [SaleType.RETAIL, SaleType.SHOP_TRANSFER, SaleType.WHOLESALE];

async function getStats() {
  const [retail, transfers, wholesale, shopStock, emptyShop] = await Promise.all([
    prisma.sale.count({ where: { type: "RETAIL" } }),
    prisma.sale.count({ where: { type: "SHOP_TRANSFER" } }),
    prisma.sale.count({ where: { type: "WHOLESALE" } }),
    prisma.carton.count({
      where: {
        location: "SHOP",
        OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
      },
    }),
    prisma.carton.count({
      where: { location: "SHOP", remainingCartons: 0, remainingItems: 0 },
    }),
  ]);

  return {
    retail,
    transfers,
    wholesale,
    shopStock,
    emptyShop,
    totalSales: retail + transfers + wholesale,
  };
}

async function cleanupShop() {
  return prisma.$transaction(async (tx) => {
    const moved = await moveRemainingShopStockToWarehouse(tx);
    const removed = await purgeEmptyShopCartons(tx);
    return { moved, removed };
  });
}

function printResetResults(label: string, results: Awaited<ReturnType<typeof resetSalesByTypes>>) {
  console.log(
    `${label}: reversed ${results.reversed.length}, force ${results.forced.length}, failed ${results.failed.length}`
  );
  for (const failure of results.failed) {
    console.log(`  ✗ ${failure.saleNumber}: ${failure.error}`);
  }
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "(not set)");
  console.log("");

  let stats = await getStats();
  console.log("Current state:");
  console.log(
    `  Sales: ${stats.totalSales} (retail ${stats.retail}, transfers ${stats.transfers}, wholesale ${stats.wholesale})`
  );
  console.log(`  Shop stock rows: ${stats.shopStock}, empty shop rows: ${stats.emptyShop}`);

  if (stats.totalSales === 0 && stats.shopStock === 0 && stats.emptyShop === 0) {
    console.log("\nAlready clean.");
    return;
  }

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
    return;
  }

  for (let pass = 1; pass <= 2; pass++) {
    stats = await getStats();
    if (stats.totalSales === 0 && stats.shopStock === 0) break;

    console.log(`\nPass ${pass}: reset sales...`);
    const results = await resetSalesByTypes(TYPES);
    printResetResults("  Sales", results);

    console.log(`Pass ${pass}: cleanup shop...`);
    const shop = await cleanupShop();
    console.log(
      `  Moved ${shop.moved.length} product(s), removed ${shop.removed} empty row(s)`
    );
  }

  stats = await getStats();
  console.log("\nFinal state:");
  console.log(`  Sales: ${stats.totalSales}`);
  console.log(`  Shop stock rows: ${stats.shopStock}, empty shop rows: ${stats.emptyShop}`);

  if (stats.totalSales > 0 || stats.shopStock > 0) {
    console.log("\nSome records could not be cleared automatically.");
    process.exitCode = 1;
  } else {
    console.log("\nDone. Shop is empty and all sales are removed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
