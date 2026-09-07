/**
 * Reverses all retail, shop transfer, and wholesale sales.
 * Stock is restored in order: retail → shop transfers → wholesale.
 *
 * Usage:
 *   npm run db:reset:sales -- --confirm
 *
 * Dry run (count only):
 *   npm run db:reset:sales
 */
import { SaleType } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { resetSalesByTypes } from "../src/lib/sale-mutations";

const TYPES: SaleType[] = [SaleType.RETAIL, SaleType.SHOP_TRANSFER, SaleType.WHOLESALE];

async function main() {
  const confirm = process.argv.includes("--confirm");

  const counts = await Promise.all(
    TYPES.map(async (type) => ({
      type,
      count: await prisma.sale.count({ where: { type } }),
    }))
  );

  console.log("Sales to reset:");
  for (const { type, count } of counts) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`  Total: ${counts.reduce((sum, row) => sum + row.count, 0)}`);

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to reverse and delete these sales.");
    return;
  }

  console.log("\nReversing sales (retail → shop transfers → wholesale)...\n");

  const results = await resetSalesByTypes(TYPES);

  console.log(`Reversed: ${results.reversed.length}`);
  for (const saleNumber of results.reversed) {
    console.log(`  ✓ ${saleNumber}`);
  }

  if (results.forced.length > 0) {
    console.log(`\nForce-completed (partial shop stock): ${results.forced.length}`);
    for (const saleNumber of results.forced) {
      console.log(`  ⚠ ${saleNumber}`);
    }
  }

  if (results.failed.length > 0) {
    console.log(`\nFailed: ${results.failed.length}`);
    for (const failure of results.failed) {
      console.log(`  ✗ ${failure.saleNumber}: ${failure.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nDone. Imports and warehouse stock are unchanged.");
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
