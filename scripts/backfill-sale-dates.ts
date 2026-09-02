/**
 * Backfill saleDateEthiopian and fix saleDate for legacy mis-entered dates.
 * Run: npx tsx scripts/backfill-sale-dates.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  ethiopianToGregorian,
  parseEthiopianDateInput,
} from "../src/lib/ethiopian-calendar";
import { ensureSaleDateEthiopian } from "../src/lib/sale-dates";
import { startOfLocalDay } from "../src/lib/utils";

const prisma = new PrismaClient();

function applyCreatedTime(dateOnly: Date, createdAt: Date) {
  const result = startOfLocalDay(dateOnly);
  result.setHours(
    createdAt.getHours(),
    createdAt.getMinutes(),
    createdAt.getSeconds(),
    createdAt.getMilliseconds()
  );
  return result;
}

async function main() {
  const sales = await prisma.sale.findMany({
    where: {
      OR: [{ saleDateEthiopian: null }, { saleDateEthiopian: "" }],
    },
    select: { id: true, saleNumber: true, saleDate: true, createdAt: true },
  });

  let updated = 0;
  for (const sale of sales) {
    const saleDateEthiopian = ensureSaleDateEthiopian(sale.saleDate, null);
    const eth = parseEthiopianDateInput(saleDateEthiopian);
    const greg = ethiopianToGregorian(eth);
    const saleDate = applyCreatedTime(greg, sale.createdAt);

    await prisma.sale.update({
      where: { id: sale.id },
      data: { saleDateEthiopian, saleDate },
    });
    updated += 1;
  }

  console.log(`Backfilled ${updated} sales.`);

  const dist = await prisma.sale.groupBy({
    by: ["saleDateEthiopian"],
    _count: true,
    orderBy: { _count: { saleDateEthiopian: "desc" } },
    take: 10,
  });
  console.log("Top Ethiopian dates:", dist);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
