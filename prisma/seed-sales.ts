import {
  Location,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SaleType,
} from "@prisma/client";
import { recordRetailCollection } from "../src/lib/retail-ledger";
import { prisma } from "../src/lib/prisma";

const SEED_PREFIX = "RT-SEED-";
const DOWNTOWN_SHOP_ID = "demo-shop-downtown";

type Tx = Prisma.TransactionClient;

type ShopCarton = {
  id: string;
  productId: string;
  productName: string;
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
  retailUnitPrice: number;
  wholesaleUnitPrice: number;
};

type RetailLineInput = {
  sku: string;
  cartonsSold?: number;
  itemsSold?: number;
  unitPrice?: number;
};

type RetailSaleInput = {
  saleNumber: string;
  clientId: string;
  daysAgo: number;
  hour?: number;
  items: RetailLineInput[];
  paymentStatus: PaymentStatus;
  paidFraction?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
};

function daysAgoAt(days: number, hour = 11) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 30, 0, 0);
  return date;
}

function lineQuantity(carton: ShopCarton, cartonsSold: number, itemsSold: number) {
  return cartonsSold * carton.itemsPerCarton + itemsSold;
}

function lineTotal(carton: ShopCarton, cartonsSold: number, itemsSold: number, unitPrice: number) {
  return lineQuantity(carton, cartonsSold, itemsSold) * unitPrice;
}

async function ensureDowntownStock(tx: Tx) {
  const cartons = await tx.carton.findMany({
    where: { location: Location.SHOP, shopId: DOWNTOWN_SHOP_ID },
  });

  for (const carton of cartons) {
    const minCartons = 20;
    const minItems = minCartons * carton.itemsPerCarton;
    await tx.carton.update({
      where: { id: carton.id },
      data: {
        remainingCartons: Math.max(carton.remainingCartons, minCartons),
        remainingItems: Math.max(carton.remainingItems, minItems),
        totalCartons: Math.max(carton.totalCartons, minCartons),
      },
    });
  }
}

async function loadDowntownCartons(tx: Tx): Promise<Map<string, ShopCarton>> {
  const cartons = await tx.carton.findMany({
    where: { location: Location.SHOP, shopId: DOWNTOWN_SHOP_ID },
    include: { product: true },
  });

  const map = new Map<string, ShopCarton>();
  for (const carton of cartons) {
    map.set(carton.product.sku ?? carton.product.name, {
      id: carton.id,
      productId: carton.productId,
      productName: carton.product.name,
      itemsPerCarton: carton.itemsPerCarton,
      remainingCartons: carton.remainingCartons,
      remainingItems: carton.remainingItems,
      retailUnitPrice: Number(carton.retailUnitPrice ?? carton.product.unitCost),
      wholesaleUnitPrice: Number(carton.warehouseLeavingPrice ?? carton.product.unitCost),
    });
  }
  return map;
}

function getCarton(map: Map<string, ShopCarton>, sku: string) {
  const carton = map.get(sku);
  if (!carton) throw new Error(`No shop stock found for ${sku} at Downtown Branch`);
  return carton;
}

function assertStock(carton: ShopCarton, cartonsSold: number, itemsSold: number, label: string) {
  const qty = lineQuantity(carton, cartonsSold, itemsSold);
  if (qty <= 0) throw new Error(`${label}: quantity must be positive`);
  if (cartonsSold > carton.remainingCartons) {
    throw new Error(`${label}: not enough cartons for ${carton.productName}`);
  }
  if (qty > carton.remainingItems) {
    throw new Error(`${label}: not enough stock for ${carton.productName}`);
  }
}

function deductStock(carton: ShopCarton, cartonsSold: number, itemsSold: number) {
  const moved = lineQuantity(carton, cartonsSold, itemsSold);
  carton.remainingCartons -= cartonsSold;
  carton.remainingItems -= moved;
}

async function ensureBanks(tx: Tx) {
  for (const name of ["CBE", "Awash Bank", "Dashen Bank"]) {
    await tx.bankAccount.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    });
  }
}

async function createRetailSale(
  tx: Tx,
  saraId: string,
  stock: Map<string, ShopCarton>,
  input: RetailSaleInput
) {
  const existing = await tx.sale.findUnique({ where: { saleNumber: input.saleNumber } });
  if (existing) return false;

  const saleItems: {
    cartonId: string;
    cartonsSold: number;
    itemsSold: number;
    unitPrice: number;
    totalPrice: number;
    profit: number;
  }[] = [];

  for (const line of input.items) {
    const carton = getCarton(stock, line.sku);
    const cartonsSold = line.cartonsSold ?? 0;
    const itemsSold = line.itemsSold ?? 0;
    assertStock(carton, cartonsSold, itemsSold, input.saleNumber);
  }

  let totalAmount = 0;

  for (const line of input.items) {
    const carton = getCarton(stock, line.sku);
    const cartonsSold = line.cartonsSold ?? 0;
    const itemsSold = line.itemsSold ?? 0;
    const unitPrice = line.unitPrice ?? carton.retailUnitPrice;
    const totalPrice = lineTotal(carton, cartonsSold, itemsSold, unitPrice);
    const qty = lineQuantity(carton, cartonsSold, itemsSold);
    const profit = qty * (unitPrice - carton.wholesaleUnitPrice);

    saleItems.push({
      cartonId: carton.id,
      cartonsSold,
      itemsSold,
      unitPrice,
      totalPrice,
      profit,
    });
    totalAmount += totalPrice;
    deductStock(carton, cartonsSold, itemsSold);
  }

  let paidAmount = 0;
  if (input.paymentStatus === PaymentStatus.PAID) {
    paidAmount = totalAmount;
  } else if (input.paymentStatus === PaymentStatus.PARTIAL) {
    paidAmount = Math.round(totalAmount * (input.paidFraction ?? 0.5));
    if (paidAmount <= 0 || paidAmount >= totalAmount) {
      paidAmount = Math.max(1, Math.floor(totalAmount / 2));
    }
  }

  const sale = await tx.sale.create({
    data: {
      saleNumber: input.saleNumber,
      type: SaleType.RETAIL,
      clientId: input.clientId,
      shopId: DOWNTOWN_SHOP_ID,
      totalAmount,
      paidAmount,
      paymentStatus: input.paymentStatus,
      retailSoldById: saraId,
      saleDate: daysAgoAt(input.daysAgo, input.hour),
      notes: input.notes,
      items: {
        create: saleItems.map(({ profit: _profit, ...item }) => item),
      },
    },
  });

  if (paidAmount > 0 && input.paymentMethod) {
    let bankAccountId: string | undefined;
    if (input.paymentMethod === PaymentMethod.BANK_TRANSFER) {
      const bank = await tx.bankAccount.findFirst({ where: { name: "CBE", isActive: true } });
      bankAccountId = bank?.id;
    }

    const payment = await tx.payment.create({
      data: {
        saleId: sale.id,
        amount: paidAmount,
        paymentMethod: input.paymentMethod,
        bankAccountId,
        paymentDate: daysAgoAt(input.daysAgo, input.hour),
        collectedById: saraId,
      },
    });

    await recordRetailCollection(
      tx,
      DOWNTOWN_SHOP_ID,
      sale.id,
      payment.id,
      paidAmount,
      sale.saleNumber,
      daysAgoAt(input.daysAgo, input.hour)
    );
  }

  return true;
}

async function persistStock(tx: Tx, stock: Map<string, ShopCarton>) {
  for (const carton of stock.values()) {
    await tx.carton.update({
      where: { id: carton.id },
      data: {
        remainingCartons: carton.remainingCartons,
        remainingItems: carton.remainingItems,
      },
    });
  }
}

const RETAIL_SALES: RetailSaleInput[] = [
  {
    saleNumber: `${SEED_PREFIX}001`,
    clientId: "demo-client-walkin",
    daysAgo: 0,
    hour: 9,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [
      { sku: "ELC-EXT-4SKT", cartonsSold: 2 },
      { sku: "ELC-HDMI-2M", cartonsSold: 1, itemsSold: 2 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}002`,
    clientId: "demo-client-walkin",
    daysAgo: 0,
    hour: 11,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    items: [{ sku: "ELC-USB-C-1M", cartonsSold: 1 }],
  },
  {
    saleNumber: `${SEED_PREFIX}003`,
    clientId: "demo-client-fatima",
    daysAgo: 0,
    hour: 14,
    paymentStatus: PaymentStatus.CREDIT,
    notes: "Pay on Saturday",
    items: [{ sku: "ELC-EXT-4SKT", itemsSold: 8 }],
  },
  {
    saleNumber: `${SEED_PREFIX}004`,
    clientId: "demo-client-bole",
    daysAgo: 1,
    hour: 10,
    paymentStatus: PaymentStatus.PARTIAL,
    paidFraction: 0.4,
    paymentMethod: PaymentMethod.CASH,
    items: [
      { sku: "ELC-HDMI-2M", cartonsSold: 2 },
      { sku: "ELC-EXT-4SKT", cartonsSold: 1, itemsSold: 4 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}005`,
    clientId: "demo-client-walkin",
    daysAgo: 1,
    hour: 16,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [{ sku: "ELC-USB-C-1M", cartonsSold: 1, itemsSold: 3 }],
  },
  {
    saleNumber: `${SEED_PREFIX}006`,
    clientId: "demo-client-mohammed",
    daysAgo: 2,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    items: [{ sku: "ELC-EXT-4SKT", cartonsSold: 1 }],
  },
  {
    saleNumber: `${SEED_PREFIX}007`,
    clientId: "demo-client-fatima",
    daysAgo: 2,
    hour: 15,
    paymentStatus: PaymentStatus.CREDIT,
    items: [
      { sku: "ELC-HDMI-2M", cartonsSold: 1 },
      { sku: "ELC-EXT-4SKT", itemsSold: 6 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}008`,
    clientId: "demo-client-walkin",
    daysAgo: 3,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    items: [
      { sku: "ELC-USB-C-1M", itemsSold: 2 },
      { sku: "ELC-HDMI-2M", cartonsSold: 1 },
      { sku: "ELC-EXT-4SKT", itemsSold: 3 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}009`,
    clientId: "demo-client-ahmed",
    daysAgo: 4,
    paymentStatus: PaymentStatus.PARTIAL,
    paidFraction: 0.6,
    paymentMethod: PaymentMethod.CASH,
    items: [{ sku: "ELC-USB-C-1M", cartonsSold: 1 }],
  },
  {
    saleNumber: `${SEED_PREFIX}010`,
    clientId: "demo-client-walkin",
    daysAgo: 5,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [{ sku: "ELC-HDMI-2M", cartonsSold: 2 }],
  },
  {
    saleNumber: `${SEED_PREFIX}011`,
    clientId: "demo-client-bole",
    daysAgo: 6,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    items: [{ sku: "ELC-EXT-4SKT", cartonsSold: 2, itemsSold: 5 }],
  },
  {
    saleNumber: `${SEED_PREFIX}012`,
    clientId: "demo-client-fatima",
    daysAgo: 8,
    paymentStatus: PaymentStatus.CREDIT,
    items: [{ sku: "ELC-HDMI-2M", cartonsSold: 1, itemsSold: 1 }],
  },
  {
    saleNumber: `${SEED_PREFIX}013`,
    clientId: "demo-client-walkin",
    daysAgo: 10,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [
      { sku: "ELC-EXT-4SKT", cartonsSold: 1 },
      { sku: "ELC-HDMI-2M", itemsSold: 4 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}014`,
    clientId: "demo-client-mohammed",
    daysAgo: 12,
    paymentStatus: PaymentStatus.PARTIAL,
    paidFraction: 0.3,
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    items: [{ sku: "ELC-USB-C-1M", cartonsSold: 1, itemsSold: 1 }],
  },
  {
    saleNumber: `${SEED_PREFIX}015`,
    clientId: "demo-client-walkin",
    daysAgo: 14,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [{ sku: "ELC-EXT-4SKT", itemsSold: 12 }],
  },
  {
    saleNumber: `${SEED_PREFIX}016`,
    clientId: "demo-client-bole",
    daysAgo: 18,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    items: [{ sku: "ELC-HDMI-2M", cartonsSold: 2 }],
  },
  {
    saleNumber: `${SEED_PREFIX}017`,
    clientId: "demo-client-fatima",
    daysAgo: 22,
    paymentStatus: PaymentStatus.CREDIT,
    notes: "Monthly account",
    items: [
      { sku: "ELC-USB-C-1M", cartonsSold: 1 },
      { sku: "ELC-HDMI-2M", cartonsSold: 1 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}018`,
    clientId: "demo-client-walkin",
    daysAgo: 25,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [{ sku: "ELC-EXT-4SKT", cartonsSold: 1, itemsSold: 2 }],
  },
  {
    saleNumber: `${SEED_PREFIX}019`,
    clientId: "demo-client-walkin",
    daysAgo: 0,
    hour: 17,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH,
    items: [
      { sku: "ELC-HDMI-2M", cartonsSold: 1 },
      { sku: "ELC-EXT-4SKT", cartonsSold: 1 },
      { sku: "ELC-USB-C-1M", itemsSold: 1 },
    ],
  },
  {
    saleNumber: `${SEED_PREFIX}020`,
    clientId: "demo-client-ahmed",
    daysAgo: 3,
    hour: 12,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    items: [{ sku: "ELC-HDMI-2M", cartonsSold: 1, itemsSold: 3 }],
  },
];

export async function seedSalesPreview() {
  const downtown = await prisma.shop.findUnique({ where: { id: DOWNTOWN_SHOP_ID } });
  if (!downtown) {
    console.log("Downtown shop not found. Run npm run db:seed or npm run db:reset first.");
    return { created: 0, skipped: 0 };
  }

  const sara = await prisma.user.findUnique({ where: { email: "sara@stockmoney.com" } });
  if (!sara) {
    console.log("Salesperson Sara not found. Run npm run db:seed first.");
    return { created: 0, skipped: 0 };
  }

  const alreadySeeded = await prisma.sale.count({
    where: { saleNumber: { startsWith: SEED_PREFIX } },
  });
  if (alreadySeeded >= RETAIL_SALES.length) {
    console.log(`Sales preview already seeded (${alreadySeeded} sales).`);
    return { created: 0, skipped: alreadySeeded };
  }

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    await ensureBanks(tx);
    await ensureDowntownStock(tx);
    const stock = await loadDowntownCartons(tx);

    if (stock.size === 0) {
      throw new Error("No shop inventory at Downtown Branch. Run npm run db:reset first.");
    }

    for (const sale of RETAIL_SALES) {
      const added = await createRetailSale(tx, sara.id, stock, sale);
      if (added) created += 1;
      else skipped += 1;
    }

    await persistStock(tx, stock);
  });

  return { created, skipped };
}

async function main() {
  console.log("Seeding extra retail sales for Sales page preview...\n");
  const { created, skipped } = await seedSalesPreview();
  console.log(`Created ${created} sales, skipped ${skipped} (already existed).`);
  console.log("\nLog in as sara@stockmoney.com / sales123 to view Downtown retail history.");
  console.log("Use Today / Last 7 Days / Last 30 Days filters to explore the list.\n");
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
