/**
 * Repairs shop/warehouse carton rows whose items-per-carton differs from the product's
 * original import row. Such rows block returns ("Not enough stock to return").
 *
 * The carton count is trusted (it matches the physical count); items are recalculated
 * with the correct carton size, keeping any loose items.
 *
 *   npx tsx scripts/repair-carton-size.ts          # dry run, shows what would change
 *   npx tsx scripts/repair-carton-size.ts --apply  # writes the changes
 *
 * Back up the database file before running with --apply.
 */
import prisma from "../src/lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log(apply ? "Mode: APPLY" : "Mode: dry run (add --apply to write)\n");

  const products = await prisma.importProduct.findMany({
    include: { cartons: { include: { shop: { select: { name: true } } } } },
  });

  const fixes: {
    id: string;
    label: string;
    itemsPerCarton: number;
    remainingItems: number;
  }[] = [];

  for (const product of products) {
    const original = product.cartons.find((carton) => !carton.cartonNumber.includes("-"));
    if (!original) continue;

    for (const carton of product.cartons) {
      if (carton.itemsPerCarton === original.itemsPerCarton) continue;

      const looseItems = Math.max(
        0,
        carton.remainingItems - carton.remainingCartons * carton.itemsPerCarton
      );
      const remainingItems = carton.remainingCartons * original.itemsPerCarton + looseItems;
      const where = carton.location === "SHOP" ? `SHOP ${carton.shop?.name ?? "?"}` : "WAREHOUSE";
      const label =
        `${product.name} [${carton.cartonNumber} @ ${where}] ` +
        `${carton.remainingCartons} ctn: ${carton.itemsPerCarton}/ctn, ${carton.remainingItems} items ` +
        `-> ${original.itemsPerCarton}/ctn, ${remainingItems} items`;

      fixes.push({ id: carton.id, label, itemsPerCarton: original.itemsPerCarton, remainingItems });
    }
  }

  if (fixes.length === 0) {
    console.log("No mismatched carton rows found.");
    return;
  }

  for (const fix of fixes) console.log("  " + fix.label);

  if (!apply) return;

  await prisma.$transaction(
    fixes.map((fix) =>
      prisma.carton.update({
        where: { id: fix.id },
        data: { itemsPerCarton: fix.itemsPerCarton, remainingItems: fix.remainingItems },
      })
    )
  );
  console.log(`\nUpdated ${fixes.length} row(s).`);
}

main().finally(() => prisma.$disconnect());
