/**
 * Repairs stock rows damaged by older versions of the app, then records cost prices on
 * existing sale lines so their profit no longer changes when prices change.
 *
 * Fixes, in order:
 *   1. Carton size differs from the product's original import row (blocked returns).
 *   2. Negative cartons or items.
 *   3. Warehouse rows whose items don't equal cartons x items-per-carton
 *      (the warehouse only ever holds full cartons).
 *   4. Shop rows showing more full cartons than their items can fill
 *      (loose-item sales used to leave the carton count unchanged).
 *   5. Sale lines with no recorded cost: fills in the cost the reports use today.
 *
 *   npm run db:repair:stock               # dry run, shows what would change
 *   npm run db:repair:stock -- --apply    # writes the changes
 *
 * Back up the database file before running with --apply.
 */
import prisma from "../src/lib/prisma";

const apply = process.argv.includes("--apply");

type CartonFix = {
  id: string;
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
  reasons: string[];
  before: string;
  label: string;
};

async function planCartonFixes() {
  const products = await prisma.importProduct.findMany({
    include: { cartons: { include: { shop: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });

  const fixes: CartonFix[] = [];

  for (const product of products) {
    const original = product.cartons.find((carton) => !carton.cartonNumber.includes("-"));

    for (const carton of product.cartons) {
      let { itemsPerCarton, remainingCartons, remainingItems } = carton;
      const reasons: string[] = [];

      if (original && itemsPerCarton !== original.itemsPerCarton) {
        const looseItems = Math.max(0, remainingItems - remainingCartons * itemsPerCarton);
        itemsPerCarton = original.itemsPerCarton;
        remainingItems = remainingCartons * itemsPerCarton + looseItems;
        reasons.push("wrong carton size");
      }

      if (remainingCartons < 0 || remainingItems < 0) {
        remainingCartons = Math.max(0, remainingCartons);
        remainingItems = Math.max(0, remainingItems);
        reasons.push("negative stock");
      }

      if (carton.location === "WAREHOUSE" && remainingItems !== remainingCartons * itemsPerCarton) {
        remainingItems = remainingCartons * itemsPerCarton;
        reasons.push("warehouse items don't match cartons");
      }

      if (carton.location === "SHOP" && remainingCartons > Math.floor(remainingItems / itemsPerCarton)) {
        remainingCartons = Math.floor(remainingItems / itemsPerCarton);
        reasons.push("more cartons than items");
      }

      if (reasons.length === 0) continue;

      const where = carton.location === "SHOP" ? `SHOP ${carton.shop?.name ?? "?"}` : "WAREHOUSE";
      fixes.push({
        id: carton.id,
        itemsPerCarton,
        remainingCartons,
        remainingItems,
        reasons,
        label: `${product.name} [${carton.cartonNumber} @ ${where}]`,
        before: `${carton.remainingCartons} ctn / ${carton.remainingItems} items (${carton.itemsPerCarton}/ctn)`,
      });
    }
  }

  return fixes;
}

async function planCostBackfill() {
  const items = await prisma.saleItem.findMany({
    where: { costPrice: null },
    select: {
      id: true,
      sale: { select: { type: true } },
      carton: {
        select: { warehouseLeavingPrice: true, product: { select: { unitCost: true } } },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    costPrice:
      item.sale.type === "RETAIL"
        ? (item.carton.warehouseLeavingPrice ?? item.carton.product.unitCost)
        : item.carton.product.unitCost,
  }));
}

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log(apply ? "Mode: APPLY\n" : "Mode: dry run (add --apply to write)\n");

  const cartonFixes = await planCartonFixes();
  console.log(`Stock rows to repair: ${cartonFixes.length}`);
  for (const fix of cartonFixes) {
    console.log(`  ${fix.label}`);
    console.log(
      `      ${fix.before}  ->  ${fix.remainingCartons} ctn / ${fix.remainingItems} items (${fix.itemsPerCarton}/ctn)`
    );
    console.log(`      reason: ${fix.reasons.join(", ")}`);
  }

  const costFixes = await planCostBackfill();
  console.log(`\nSale lines missing a recorded cost: ${costFixes.length}`);

  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    for (const fix of cartonFixes) {
      await tx.carton.update({
        where: { id: fix.id },
        data: {
          itemsPerCarton: fix.itemsPerCarton,
          remainingCartons: fix.remainingCartons,
          remainingItems: fix.remainingItems,
        },
      });
    }
    for (const fix of costFixes) {
      await tx.saleItem.update({ where: { id: fix.id }, data: { costPrice: fix.costPrice } });
    }
  }, { timeout: 120_000 });

  console.log(`\nUpdated ${cartonFixes.length} stock row(s) and ${costFixes.length} sale line(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
