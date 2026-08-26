import {
  ExpenseCategory,
  LedgerType,
  Location,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SaleType,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { recordRetailCollection } from "../src/lib/retail-ledger";

import {
  PREVIEW_LOW_STOCK_SKUS,
  PREVIEW_WAREHOUSE_LOW_SKU,
} from "./demo-catalog";

const DOWNTOWN_SHOP_ID = "demo-shop-downtown";
const PREVIEW_EXPENSE_PREFIX = "preview-expense-";
const PREVIEW_SALE_PREFIX = "RT-PREV-";

type Tx = Prisma.TransactionClient;

function daysAgo(days: number, hour = 11) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 30, 0, 0);
  return date;
}

async function setLowStock() {
  for (const target of PREVIEW_LOW_STOCK_SKUS) {
    const carton = await prisma.carton.findFirst({
      where: {
        location: Location.SHOP,
        shopId: DOWNTOWN_SHOP_ID,
        product: { sku: target.sku },
      },
    });

    if (!carton) continue;

    await prisma.carton.update({
      where: { id: carton.id },
      data: {
        remainingCartons: target.remainingCartons,
        remainingItems: target.remainingItems,
        totalCartons: Math.max(carton.totalCartons, 20),
      },
    });
  }

  const warehouseLow = await prisma.carton.findFirst({
    where: {
      location: Location.WAREHOUSE,
      product: { sku: PREVIEW_WAREHOUSE_LOW_SKU },
    },
  });

  if (warehouseLow) {
    await prisma.carton.update({
      where: { id: warehouseLow.id },
      data: {
        remainingCartons: 2,
        remainingItems: 60,
        totalCartons: Math.max(warehouseLow.totalCartons, 15),
      },
    });
  }

  const warehouseDetergent = await prisma.carton.findFirst({
    where: {
      location: Location.WAREHOUSE,
      product: { sku: "BLD-NAIL-2IN" },
    },
  });

  if (warehouseDetergent) {
    await prisma.carton.update({
      where: { id: warehouseDetergent.id },
      data: {
        remainingCartons: 3,
        remainingItems: 120,
        totalCartons: Math.max(warehouseDetergent.totalCartons, 40),
      },
    });
  }
}

async function seedSalespersonExpenses(saraId: string) {
  const expenses = [
    { key: "transport-1", description: "Transport", amount: 850, daysAgo: 1, notes: "Client delivery" },
    { key: "fuel-1", description: "Fuel", amount: 1200, daysAgo: 3 },
    { key: "lunch-1", description: "Lunch", amount: 350, daysAgo: 5 },
    { key: "rent-1", description: "Shop rent", amount: 5000, daysAgo: 8 },
    { key: "transport-2", description: "Transport", amount: 600, daysAgo: 11 },
    { key: "snacks-1", description: "Snacks", amount: 200, daysAgo: 14 },
    { key: "utilities-1", description: "Utilities", amount: 1800, daysAgo: 6 },
  ];

  for (const item of expenses) {
    const marker = `${PREVIEW_EXPENSE_PREFIX}${item.key}`;
    const existing = await prisma.expense.findFirst({
      where: { paidById: saraId, notes: marker },
    });
    if (existing) continue;

    const expenseDate = daysAgo(item.daysAgo, 9);

    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          category: ExpenseCategory.SHOP,
          description: item.description,
          amount: item.amount,
          expenseDate,
          paidById: saraId,
          notes: marker,
        },
      });

      await tx.salespersonLedger.create({
        data: {
          userId: saraId,
          type: LedgerType.EXPENSE,
          amount: -item.amount,
          description: `Expense: ${item.description}`,
          expenseId: expense.id,
          entryDate: expenseDate,
        },
      });
    });
  }
}

async function seedCreditPayments(saraId: string) {
  const creditSales = await prisma.sale.findMany({
    where: {
      type: SaleType.RETAIL,
      shopId: DOWNTOWN_SHOP_ID,
      retailSoldById: saraId,
      paymentStatus: { in: [PaymentStatus.CREDIT, PaymentStatus.PARTIAL] },
    },
    orderBy: { saleDate: "desc" },
    take: 4,
  });

  for (const [index, sale] of creditSales.entries()) {
    const total = Number(sale.totalAmount);
    const paid = Number(sale.paidAmount);
    const outstanding = total - paid;
    if (outstanding <= 0) continue;

    const paymentAmount = Math.min(outstanding, Math.max(500, Math.floor(outstanding * 0.35)));
    const marker = `preview-payment-${sale.id}`;

    const existing = await prisma.payment.findFirst({
      where: { saleId: sale.id, notes: marker },
    });
    if (existing) continue;

    const paymentDate = daysAgo(2 + index, 15);

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          amount: paymentAmount,
          paymentMethod: PaymentMethod.CASH,
          paymentDate,
          collectedById: saraId,
          notes: marker,
        },
      });

      const newPaid = paid + paymentAmount;
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newPaid >= total ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
        },
      });
    });
  }
}

async function getDowntownCarton(tx: Tx, sku: string) {
  return tx.carton.findFirst({
    where: {
      location: Location.SHOP,
      shopId: DOWNTOWN_SHOP_ID,
      product: { sku },
    },
    include: { product: true },
  });
}

async function createTrendSale(
  tx: Tx,
  saraId: string,
  input: {
    saleNumber: string;
    sku: string;
    itemsSold: number;
    daysAgo: number;
    hour?: number;
    clientId?: string;
  }
) {
  const existing = await tx.sale.findUnique({ where: { saleNumber: input.saleNumber } });
  if (existing) return false;

  const carton = await getDowntownCarton(tx, input.sku);
  if (!carton || carton.remainingItems < input.itemsSold) return false;

  const unitPrice = Number(carton.retailUnitPrice ?? carton.product.unitCost);
  const totalAmount = input.itemsSold * unitPrice;
  const saleDate = daysAgo(input.daysAgo, input.hour ?? 10);

  const sale = await tx.sale.create({
    data: {
      saleNumber: input.saleNumber,
      type: SaleType.RETAIL,
      clientId: input.clientId ?? "demo-client-walkin",
      shopId: DOWNTOWN_SHOP_ID,
      totalAmount,
      paidAmount: totalAmount,
      paymentStatus: PaymentStatus.PAID,
      retailSoldById: saraId,
      saleDate,
      items: {
        create: {
          cartonId: carton.id,
          cartonsSold: 0,
          itemsSold: input.itemsSold,
          unitPrice,
          totalPrice: totalAmount,
        },
      },
    },
  });

  await tx.carton.update({
    where: { id: carton.id },
    data: { remainingItems: carton.remainingItems - input.itemsSold },
  });

  const payment = await tx.payment.create({
    data: {
      saleId: sale.id,
      amount: totalAmount,
      paymentMethod: PaymentMethod.CASH,
      paymentDate: saleDate,
      collectedById: saraId,
    },
  });

  await recordRetailCollection(
    tx,
    DOWNTOWN_SHOP_ID,
    sale.id,
    payment.id,
    totalAmount,
    sale.saleNumber,
    saleDate
  );

  return true;
}

async function fillSalesTrend(saraId: string) {
  const gapDays = [
    { daysAgo: 7, sku: "OIL-5L", itemsSold: 2, hour: 11 },
    { daysAgo: 9, sku: "RICE-25", itemsSold: 3, hour: 13 },
    { daysAgo: 11, sku: "OIL-5L", itemsSold: 2, hour: 10 },
    { daysAgo: 13, sku: "RICE-25", itemsSold: 2, hour: 16 },
  ];

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const gap of gapDays) {
      const added = await createTrendSale(tx, saraId, {
        saleNumber: `${PREVIEW_SALE_PREFIX}${String(gap.daysAgo).padStart(2, "0")}`,
        sku: gap.sku,
        itemsSold: gap.itemsSold,
        daysAgo: gap.daysAgo,
        hour: gap.hour,
      });
      if (added) created += 1;
    }
  });

  return created;
}

async function backfillRetailLedger() {
  await prisma.salespersonLedger.deleteMany({
    where: { description: { startsWith: "Retail profit" } },
  });

  const retailSales = await prisma.sale.findMany({
    where: {
      type: SaleType.RETAIL,
      shopId: { not: null },
      paidAmount: { gt: 0 },
    },
    include: { payments: true },
  });

  let created = 0;

  for (const sale of retailSales) {
    let payments = sale.payments;

    if (payments.length === 0) {
      const payment = await prisma.payment.create({
        data: {
          saleId: sale.id,
          amount: sale.paidAmount,
          paymentMethod: PaymentMethod.CASH,
          paymentDate: sale.saleDate,
          collectedById: sale.retailSoldById,
        },
      });
      payments = [payment];
    }

    for (const payment of payments) {
      const existing = await prisma.salespersonLedger.findUnique({
        where: { paymentId: payment.id },
      });
      if (existing || !sale.shopId) continue;

      await prisma.$transaction(async (tx) => {
        await recordRetailCollection(
          tx,
          sale.shopId!,
          sale.id,
          payment.id,
          Number(payment.amount),
          sale.saleNumber,
          payment.paymentDate
        );
      });
      created += 1;
    }
  }

  return created;
}

export async function seedDashboardPreview() {
  const downtown = await prisma.shop.findUnique({ where: { id: DOWNTOWN_SHOP_ID } });
  if (!downtown) {
    console.log("Downtown shop not found. Run npm run db:seed first.");
    return { ok: false };
  }

  const sara = await prisma.user.findUnique({ where: { email: "sara@stockmoney.com" } });
  if (!sara) {
    console.log("Salesperson Sara not found. Run npm run db:seed first.");
    return { ok: false };
  }

  await setLowStock();
  const ledgerFixed = await backfillRetailLedger();
  await seedSalespersonExpenses(sara.id);
  await seedCreditPayments(sara.id);
  const trendSales = await fillSalesTrend(sara.id);

  return { ok: true, trendSales, ledgerFixed };
}

async function main() {
  console.log("Seeding dashboard preview data (low stock, trends, credit, expenses)...\n");

  const result = await seedDashboardPreview();
  if (!result.ok) {
    process.exit(1);
  }

  console.log("Low stock levels set for shop + warehouse products.");
  console.log("Salesperson expenses added (Transport, Fuel, Lunch, etc.).");
  console.log(`Retail ledger backfill: ${result.ledgerFixed ?? 0} collection entries synced.`);
  console.log(`Trend gap sales created: ${result.trendSales ?? 0}`);
  console.log("\n--- Log in to preview ---");
  console.log("Salesperson: sara@stockmoney.com / sales123");
  console.log("Admin:       admin@stockmoney.com / admin123");
  console.log("\nPages to check:");
  console.log("  Dashboard  -> low stock + 14-day sales trend");
  console.log("  Expenses   -> searchable categories + summary");
  console.log("  Credit     -> history, filters, unpaid sales by product");
  console.log("");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
