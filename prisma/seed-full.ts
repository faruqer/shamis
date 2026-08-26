import {
  ExpenseCategory,
  LedgerType,
  Location,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SaleType,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { seedSalesPreview } from "./seed-sales";
import { seedDashboardPreview } from "./seed-preview";
import {
  DEMO_BATCH_MARKER,
  DEMO_IMPORT_BATCHES,
  type DemoProduct,
} from "./demo-catalog";

type Tx = Prisma.TransactionClient;

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 0, 0, 0);
  return date;
}

function saleNumber(prefix: string, suffix: string) {
  return `${prefix}-DEMO-${suffix}`;
}

function markup(cost: number, pct: number) {
  return Math.round(cost * (1 + pct / 100));
}

async function upsertUser(
  email: string,
  data: { name: string; password: string; role: Role; shopId?: string | null }
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { email },
      data: { name: data.name, shopId: data.shopId ?? null, role: data.role },
    });
  }
  return prisma.user.create({
    data: {
      email,
      name: data.name,
      passwordHash: await hashPassword(data.password),
      role: data.role,
      shopId: data.shopId ?? null,
    },
  });
}

async function transferStockToShop(
  tx: Tx,
  carton: {
    id: string;
    productId: string;
    cartonNumber: string;
    itemsPerCarton: number;
    remainingCartons: number;
    remainingItems: number;
  },
  shopId: string,
  cartonsToTransfer: number,
  warehouseLeavingPrice: number,
  retailUnitPrice: number
) {
  const itemsMoved = cartonsToTransfer * carton.itemsPerCarton;
  const priceData = { warehouseLeavingPrice, retailUnitPrice };

  if (cartonsToTransfer === carton.remainingCartons && carton.remainingItems - itemsMoved === 0) {
    await tx.carton.update({
      where: { id: carton.id },
      data: { location: Location.SHOP, shopId, ...priceData },
    });
    return;
  }

  await tx.carton.update({
    where: { id: carton.id },
    data: {
      remainingCartons: carton.remainingCartons - cartonsToTransfer,
      remainingItems: carton.remainingItems - itemsMoved,
    },
  });

  const shopCarton = await tx.carton.findFirst({
    where: { productId: carton.productId, location: Location.SHOP, shopId },
  });

  if (shopCarton) {
    await tx.carton.update({
      where: { id: shopCarton.id },
      data: {
        remainingCartons: shopCarton.remainingCartons + cartonsToTransfer,
        remainingItems: shopCarton.remainingItems + itemsMoved,
        totalCartons: shopCarton.totalCartons + cartonsToTransfer,
        ...priceData,
      },
    });
  } else {
    await tx.carton.create({
      data: {
        productId: carton.productId,
        cartonNumber: `${carton.cartonNumber}-shop-${shopId.slice(-6)}`,
        itemsPerCarton: carton.itemsPerCarton,
        totalCartons: cartonsToTransfer,
        remainingCartons: cartonsToTransfer,
        remainingItems: itemsMoved,
        location: Location.SHOP,
        shopId,
        ...priceData,
      },
    });
  }
}

async function getCartonBySku(tx: Tx, sku: string, location: Location, shopId?: string) {
  return tx.carton.findFirst({
    where: {
      location,
      ...(shopId ? { shopId } : {}),
      product: { sku },
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    },
    include: { product: true },
  });
}

async function seedFoundation() {
  const downtown = await prisma.shop.upsert({
    where: { id: "demo-shop-downtown" },
    update: {
      name: "Downtown Branch",
      address: "Churchill Avenue, Addis Ababa",
      phone: "+251-911-100-200",
      notes: "Electronics & cables retail",
      isActive: true,
    },
    create: {
      id: "demo-shop-downtown",
      name: "Downtown Branch",
      address: "Churchill Avenue, Addis Ababa",
      phone: "+251-911-100-200",
      notes: "Electronics & cables retail",
    },
  });

  const merkato = await prisma.shop.upsert({
    where: { id: "demo-shop-merkato" },
    update: {
      name: "Merkato Outlet",
      address: "Merkato, Addis Ababa",
      phone: "+251-911-300-400",
      notes: "Mixed electronics and tools",
      isActive: true,
    },
    create: {
      id: "demo-shop-merkato",
      name: "Merkato Outlet",
      address: "Merkato, Addis Ababa",
      phone: "+251-911-300-400",
      notes: "Mixed electronics and tools",
    },
  });

  const bole = await prisma.shop.upsert({
    where: { id: "demo-shop-bole" },
    update: {
      name: "Bole Tools & Electronics",
      address: "Bole Road, Addis Ababa",
      phone: "+251-911-500-600",
      notes: "Building supplies and power accessories",
      isActive: true,
    },
    create: {
      id: "demo-shop-bole",
      name: "Bole Tools & Electronics",
      address: "Bole Road, Addis Ababa",
      phone: "+251-911-500-600",
      notes: "Building supplies and power accessories",
    },
  });

  const admin = await upsertUser("admin@stockmoney.com", {
    name: "Shemsi",
    password: "admin123",
    role: Role.ADMIN,
  });

  const sara = await upsertUser("sara@stockmoney.com", {
    name: "Sara Abebe",
    password: "sales123",
    role: Role.SALESPERSON,
    shopId: downtown.id,
  });

  const daniel = await upsertUser("daniel@stockmoney.com", {
    name: "Daniel Tesfaye",
    password: "sales123",
    role: Role.SALESPERSON,
    shopId: merkato.id,
  });

  const hana = await upsertUser("hana@stockmoney.com", {
    name: "Hana Bekele",
    password: "sales123",
    role: Role.SALESPERSON,
    shopId: bole.id,
  });

  const clients = [
    { id: "demo-client-ahmed", name: "Ahmed Wholesale Co.", phone: "+251-911-010-101", email: "ahmed@wholesale.et", address: "Merkato" },
    { id: "demo-client-mohammed", name: "Mohammed Trading", phone: "+251-911-020-202", email: "mohammed@trade.et", address: "Piassa" },
    { id: "demo-client-fatima", name: "Fatima Retail Store", phone: "+251-911-030-303", email: "fatima@store.et", address: "Bole" },
    { id: "demo-client-bole", name: "Bole Market Supplies", phone: "+251-911-040-404", email: "bole@supplies.et", address: "Bole Road" },
    { id: "demo-client-walkin", name: "Walk-in Customer", phone: "+251-911-050-505" },
    { id: "demo-client-build", name: "Addis Construction Supply", phone: "+251-911-060-606", email: "build@supply.et", address: "CMC" },
    { id: "demo-client-elec", name: "Ethio Electric Traders", phone: "+251-911-070-707", email: "elec@trade.et", address: "Megenagna" },
  ];

  for (const client of clients) {
    await prisma.client.upsert({ where: { id: client.id }, update: client, create: client });
  }

  for (const bank of ["Commercial Bank", "Awash Bank", "Dashen Bank"]) {
    await prisma.bankAccount.upsert({
      where: { name: bank },
      update: { isActive: true },
      create: { name: bank },
    });
  }

  return { admin, downtown, merkato, bole, sara, daniel, hana };
}

function productCreateData(product: DemoProduct, cartonIndex: number) {
  const totalItems = product.totalCartons * product.itemsPerCarton;
  return {
    name: product.name,
    sku: product.sku,
    unitCost: product.unitCost,
    cartons: {
      create: {
        cartonNumber: String(cartonIndex + 1),
        itemsPerCarton: product.itemsPerCarton,
        totalCartons: product.totalCartons,
        remainingCartons: product.totalCartons,
        remainingItems: totalItems,
        location: Location.WAREHOUSE,
      },
    },
  };
}

async function seedImportsAndInventory(
  adminId: string,
  downtownId: string,
  merkatoId: string,
  boleId: string
) {
  await prisma.$transaction(async (tx) => {
    for (const batch of DEMO_IMPORT_BATCHES) {
      const costsTotal = batch.costs.reduce((s, c) => s + c.amount, 0);
      const credit = batch.credit;

      await tx.import.create({
        data: {
          batchNumber: batch.batchNumber,
          importDate: daysAgo(batch.daysAgo),
          customCost: costsTotal,
          creditAmount: credit?.amount ?? 0,
          creditPaidAmount: credit?.paidAmount ?? 0,
          creditPaid: credit
            ? (credit.paidAmount ?? 0) >= credit.amount - 0.001
            : false,
          notes: batch.notes,
          createdById: adminId,
          costs: { create: batch.costs.map((c) => ({ name: c.name, amount: c.amount })) },
          products: {
            create: batch.products.map((p, i) => productCreateData(p, i)),
          },
        },
      });
    }

    type TransferPlan = {
      sku: string;
      shopId: string;
      cartons: number;
      leavePct: number;
      retailPct: number;
    };

    const transfers: TransferPlan[] = [
      { sku: "ELC-USB-C-1M", shopId: downtownId, cartons: 18, leavePct: 25, retailPct: 45 },
      { sku: "ELC-HDMI-2M", shopId: downtownId, cartons: 12, leavePct: 28, retailPct: 50 },
      { sku: "ELC-HDMI-5M", shopId: downtownId, cartons: 8, leavePct: 30, retailPct: 52 },
      { sku: "ELC-CHGR-20W", shopId: downtownId, cartons: 15, leavePct: 30, retailPct: 48 },
      { sku: "ELC-EXT-4SKT", shopId: downtownId, cartons: 10, leavePct: 22, retailPct: 40 },
      { sku: "ELC-DIV-6WAY", shopId: merkatoId, cartons: 14, leavePct: 24, retailPct: 42 },
      { sku: "ELC-ETH-CAT6", shopId: merkatoId, cartons: 10, leavePct: 26, retailPct: 44 },
      { sku: "BLD-HAM-500", shopId: merkatoId, cartons: 20, leavePct: 20, retailPct: 38 },
      { sku: "BLD-NAIL-2IN", shopId: merkatoId, cartons: 25, leavePct: 18, retailPct: 35 },
      { sku: "BLD-NAIL-3IN", shopId: merkatoId, cartons: 22, leavePct: 18, retailPct: 35 },
      { sku: "BLD-HAM-800", shopId: boleId, cartons: 15, leavePct: 22, retailPct: 40 },
      { sku: "BLD-SAW-18", shopId: boleId, cartons: 10, leavePct: 25, retailPct: 42 },
      { sku: "BLD-WRENCH-10", shopId: boleId, cartons: 12, leavePct: 24, retailPct: 41 },
      { sku: "ELC-BRK-32A", shopId: boleId, cartons: 8, leavePct: 28, retailPct: 45 },
      { sku: "ELC-BULB-12W", shopId: boleId, cartons: 18, leavePct: 26, retailPct: 43 },
      { sku: "BLD-TAPE-5M", shopId: boleId, cartons: 20, leavePct: 20, retailPct: 36 },
      { sku: "ELC-MULTIM", shopId: downtownId, cartons: 6, leavePct: 30, retailPct: 50 },
      { sku: "BLD-ROLLER", shopId: merkatoId, cartons: 8, leavePct: 22, retailPct: 38 },
      { sku: "ELC-SURGE-3", shopId: boleId, cartons: 12, leavePct: 24, retailPct: 42 },
      { sku: "BLD-SCREW-WD", shopId: boleId, cartons: 15, leavePct: 18, retailPct: 34 },
    ];

    for (const plan of transfers) {
      const carton = await getCartonBySku(tx, plan.sku, Location.WAREHOUSE);
      if (!carton) continue;
      const cost = parseFloat(carton.product.unitCost.toString());
      const toMove = Math.min(plan.cartons, carton.remainingCartons);
      if (toMove <= 0) continue;
      await transferStockToShop(
        tx,
        carton,
        plan.shopId,
        toMove,
        markup(cost, plan.leavePct),
        markup(cost, plan.retailPct)
      );
    }

    const wholesaleSales: {
      sku: string;
      clientId: string;
      cartons: number;
      unitPrice: number;
      days: number;
      status: PaymentStatus;
      paid?: number;
    }[] = [
      { sku: "ELC-USB-C-2M", clientId: "demo-client-elec", cartons: 8, unitPrice: 78, days: 58, status: PaymentStatus.PAID },
      { sku: "BLD-NAIL-4IN", clientId: "demo-client-build", cartons: 12, unitPrice: 72, days: 48, status: PaymentStatus.CREDIT },
      { sku: "ELC-EXT-6SKT", clientId: "demo-client-ahmed", cartons: 6, unitPrice: 395, days: 42, status: PaymentStatus.PARTIAL, paid: 8000 },
      { sku: "BLD-PLIER-3PC", clientId: "demo-client-mohammed", cartons: 5, unitPrice: 340, days: 35, status: PaymentStatus.PAID },
    ];

    for (const [index, ws] of wholesaleSales.entries()) {
      const carton = await getCartonBySku(tx, ws.sku, Location.WAREHOUSE);
      if (!carton) continue;
      const items = ws.cartons * carton.itemsPerCarton;
      const total = items * ws.unitPrice;
      const paid =
        ws.status === PaymentStatus.PAID
          ? total
          : ws.status === PaymentStatus.PARTIAL
            ? ws.paid ?? 0
            : 0;

      await tx.carton.update({
        where: { id: carton.id },
        data: {
          remainingCartons: carton.remainingCartons - ws.cartons,
          remainingItems: carton.remainingItems - items,
        },
      });

      await tx.sale.create({
        data: {
          saleNumber: saleNumber("WS", String(index + 1).padStart(3, "0")),
          type: SaleType.WHOLESALE,
          clientId: ws.clientId,
          totalAmount: total,
          paidAmount: paid,
          paymentStatus: ws.status,
          soldById: adminId,
          saleDate: daysAgo(ws.days),
          items: {
            create: {
              cartonId: carton.id,
              cartonsSold: ws.cartons,
              itemsSold: 0,
              unitPrice: ws.unitPrice,
              totalPrice: total,
            },
          },
        },
      });
    }

    const retailSales = [
      { sku: "ELC-USB-C-1M", shopId: downtownId, seller: "sara", cartons: 2, days: 18 },
      { sku: "ELC-HDMI-2M", shopId: downtownId, seller: "sara", items: 15, days: 12 },
      { sku: "BLD-HAM-500", shopId: merkatoId, seller: "daniel", cartons: 3, days: 9 },
      { sku: "ELC-BULB-12W", shopId: boleId, seller: "hana", items: 40, days: 6 },
    ];

    const sellerIds: Record<string, string> = {};
    const sara = await tx.user.findUnique({ where: { email: "sara@stockmoney.com" } });
    const daniel = await tx.user.findUnique({ where: { email: "daniel@stockmoney.com" } });
    const hana = await tx.user.findUnique({ where: { email: "hana@stockmoney.com" } });
    if (sara) sellerIds.sara = sara.id;
    if (daniel) sellerIds.daniel = daniel.id;
    if (hana) sellerIds.hana = hana.id;

    for (const [index, rt] of retailSales.entries()) {
      const carton = await getCartonBySku(tx, rt.sku, Location.SHOP, rt.shopId);
      if (!carton) continue;
      const retail = parseFloat(carton.retailUnitPrice?.toString() ?? carton.product.unitCost.toString());
      const cartonsSold = rt.cartons ?? 0;
      const itemsSold = rt.items ?? 0;
      const qty = cartonsSold * carton.itemsPerCarton + itemsSold;
      const total = qty * retail;

      await tx.carton.update({
        where: { id: carton.id },
        data: {
          remainingCartons: carton.remainingCartons - cartonsSold,
          remainingItems: carton.remainingItems - qty,
        },
      });

      await tx.sale.create({
        data: {
          saleNumber: saleNumber("RT", String(index + 1).padStart(3, "0")),
          type: SaleType.RETAIL,
          clientId: "demo-client-walkin",
          shopId: rt.shopId,
          totalAmount: total,
          paidAmount: total,
          paymentStatus: PaymentStatus.PAID,
          retailSoldById: sellerIds[rt.seller],
          saleDate: daysAgo(rt.days),
          items: {
            create: {
              cartonId: carton.id,
              cartonsSold,
              itemsSold,
              unitPrice: retail,
              totalPrice: total,
            },
          },
        },
      });
    }

    await tx.expense.createMany({
      data: [
        { category: ExpenseCategory.WAREHOUSE, description: "Warehouse rent", amount: 25000, expenseDate: daysAgo(30) },
        { category: ExpenseCategory.TAX, description: "Import duty top-up", amount: 8500, expenseDate: daysAgo(45) },
        { category: ExpenseCategory.OTHER, description: "Forklift maintenance", amount: 4200, expenseDate: daysAgo(20) },
        { category: ExpenseCategory.SHOP, description: "Shop display fixtures", amount: 6800, expenseDate: daysAgo(15) },
      ],
    });
  });
}

export async function runFullSeed(options?: { includePreview?: boolean }) {
  console.log("Seeding Stock & Money — electronics & building demo...\n");

  const { admin, downtown, merkato, bole } = await seedFoundation();
  console.log("Users, 3 shops, clients, and banks ready.");

  const exists = await prisma.import.findUnique({ where: { batchNumber: DEMO_BATCH_MARKER } });
  if (exists) {
    console.log("\nDemo data already exists. Run npm run db:reset for a fresh dataset.\n");
  } else {
    await seedImportsAndInventory(admin.id, downtown.id, merkato.id, bole.id);
    console.log(
      `Created ${DEMO_IMPORT_BATCHES.length} import batches with ${DEMO_IMPORT_BATCHES.reduce((n, b) => n + b.products.length, 0)} products.`
    );
    console.log("Shop transfers, wholesale/retail sales, and expenses added.");
  }

  if (options?.includePreview !== false) {
    const { created, skipped } = await seedSalesPreview();
    if (created > 0) {
      console.log(`Sales preview: +${created} retail sales (${skipped} skipped).`);
    }
    const preview = await seedDashboardPreview();
    if (preview.ok) {
      console.log("Dashboard preview: low stock and trends ready.");
    }
  }

  console.log("\n--- Login credentials ---");
  console.log("Admin:   admin@stockmoney.com / admin123");
  console.log("Downtown: sara@stockmoney.com / sales123");
  console.log("Merkato:  daniel@stockmoney.com / sales123");
  console.log("Bole:     hana@stockmoney.com / sales123");
  console.log("");
}

async function main() {
  await runFullSeed({ includePreview: true });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
