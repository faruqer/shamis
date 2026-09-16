import prisma from "../src/lib/prisma";

const productNameQuery = process.argv[2] ?? "alunin conn";

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log("Tracing product:", productNameQuery);
  console.log("");

  const products = await prisma.importProduct.findMany({
    where: { name: { contains: productNameQuery } },
    include: {
      import: { select: { batchNumber: true, importDate: true, notes: true } },
      cartons: {
        include: { shop: { select: { name: true } } },
        orderBy: [{ location: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (products.length === 0) {
    console.log("No product found.");
    return;
  }

  for (const product of products) {
    console.log("=".repeat(60));
    console.log(`Product: ${product.name}`);
    console.log(`Import: ${product.import.batchNumber}`);
    console.log(`Import date: ${product.import.importDate.toISOString().slice(0, 10)}`);
    console.log(`Unit cost: ${product.unitCost}`);

    let whCartons = 0;
    let whItems = 0;
    let shopCartons = 0;
    let shopItems = 0;

    console.log("\nCartons:");
    for (const c of product.cartons) {
      const loc = c.location === "SHOP" ? `SHOP (${c.shop?.name ?? "?"})` : "WAREHOUSE";
      console.log(
        `  [${loc}] ${c.cartonNumber}: ${c.remainingCartons}/${c.totalCartons} cartons, ${c.remainingItems} items, ipc=${c.itemsPerCarton}`
      );
      if (c.location === "WAREHOUSE") {
        whCartons += c.remainingCartons;
        whItems += c.remainingItems;
      } else {
        shopCartons += c.remainingCartons;
        shopItems += c.remainingItems;
      }
    }

    console.log("\nTotals:");
    console.log(`  Warehouse: ${whCartons} cartons, ${whItems} items`);
    console.log(`  Shop: ${shopCartons} cartons, ${shopItems} items`);

    const saleItems = await prisma.saleItem.findMany({
      where: { carton: { productId: product.id } },
      include: {
        sale: {
          select: {
            saleNumber: true,
            type: true,
            saleDate: true,
            shop: { select: { name: true } },
          },
        },
        carton: { select: { cartonNumber: true, location: true } },
      },
      orderBy: { sale: { saleDate: "asc" } },
    });

    console.log(`\nLinked sale items: ${saleItems.length}`);
    for (const si of saleItems) {
      console.log(
        `  ${si.sale.saleDate.toISOString().slice(0, 10)} | ${si.sale.type} | ${si.sale.saleNumber} | ${si.cartonsSold}c / ${si.itemsSold}i | carton ${si.carton.cartonNumber} [${si.carton.location}]`
      );
    }

    const returns = await prisma.salespersonLedger.findMany({
      where: {
        description: { contains: product.name },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    if (returns.length > 0) {
      console.log(`\nLedger mentions (${returns.length} shown):`);
      for (const e of returns) {
        console.log(`  ${e.createdAt.toISOString().slice(0, 10)} | ${e.type} | ${e.amount} | ${e.description}`);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
