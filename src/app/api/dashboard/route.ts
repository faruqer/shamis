import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { isSalesperson, requireSalespersonShopId } from "@/lib/shop-scope";
import { Prisma } from "@prisma/client";

async function getStockSummary(where: Prisma.CartonWhereInput) {
  const cartons = await prisma.carton.findMany({
    where: {
      ...where,
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    },
    select: { productId: true, remainingItems: true },
  });

  return {
    products: new Set(cartons.map((carton) => carton.productId)).size,
    items: cartons.reduce((sum, carton) => sum + (carton.remainingItems || 0), 0),
  };
}

const LOW_STOCK_PERCENT = 0.25;
const LOW_STOCK_ABSOLUTE = 10;
const TREND_DAYS = 14;

async function getLowStockProducts(where: Prisma.CartonWhereInput, location?: string) {
  const cartons = await prisma.carton.findMany({
    where: {
      ...where,
      OR: [{ remainingCartons: { gt: 0 } }, { remainingItems: { gt: 0 } }],
    },
    select: {
      productId: true,
      remainingItems: true,
      totalCartons: true,
      itemsPerCarton: true,
      product: { select: { name: true } },
    },
  });

  const products = new Map<
    string,
    { name: string; remainingItems: number; totalItems: number }
  >();

  for (const carton of cartons) {
    const existing = products.get(carton.productId) ?? {
      name: carton.product.name,
      remainingItems: 0,
      totalItems: 0,
    };
    existing.remainingItems += carton.remainingItems;
    existing.totalItems += carton.totalCartons * carton.itemsPerCarton;
    products.set(carton.productId, existing);
  }

  return [...products.values()]
    .filter((product) => {
      if (product.remainingItems <= 0) return false;
      if (product.remainingItems <= LOW_STOCK_ABSOLUTE) return true;
      return product.totalItems > 0 && product.remainingItems / product.totalItems <= LOW_STOCK_PERCENT;
    })
    .map((product) => ({
      name: product.name,
      remainingItems: product.remainingItems,
      stockPercent:
        product.totalItems > 0
          ? Math.round((product.remainingItems / product.totalItems) * 100)
          : 100,
      location,
    }))
    .sort((a, b) => a.stockPercent - b.stockPercent || a.remainingItems - b.remainingItems)
    .slice(0, 8);
}

function buildSalesTrend(
  sales: { saleDate: Date; totalAmount: { toString(): string } | number }[],
  days = TREND_DAYS
) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const countByDay = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const revenueByDay = new Map(buckets.map((bucket) => [bucket.key, 0]));

  for (const sale of sales) {
    const key = sale.saleDate.toISOString().slice(0, 10);
    if (!countByDay.has(key)) continue;
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + decimalToNumber(sale.totalAmount));
  }

  return {
    labels: buckets.map((bucket) => bucket.label),
    salesCount: buckets.map((bucket) => countByDay.get(bucket.key) ?? 0),
    revenue: buckets.map((bucket) => revenueByDay.get(bucket.key) ?? 0),
  };
}

function getTrendRange(days = TREND_DAYS) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export async function GET() {
  try {
    const session = await requireSession();

    if (isSalesperson(session)) {
      const shopId = requireSalespersonShopId(session);

      const trendRange = getTrendRange();

      const [shopStock, retailSales, recentSales, myLedger, lowStock, trendSales] = await Promise.all([
        getStockSummary({ location: "SHOP", shopId }),
        prisma.sale.aggregate({
          where: {
            type: "RETAIL",
            items: { some: { carton: { shopId } } },
          },
          _sum: { totalAmount: true, paidAmount: true },
          _count: true,
        }),
        prisma.sale.findMany({
          where: {
            type: "RETAIL",
            items: { some: { carton: { shopId } } },
          },
          take: 5,
          orderBy: { saleDate: "desc" },
          include: {
            client: { select: { name: true } },
            retailSoldBy: { select: { name: true } },
          },
        }),
        prisma.salespersonLedger.aggregate({
          where: { userId: session.id },
          _sum: { amount: true },
        }),
        getLowStockProducts({ location: "SHOP", shopId }, "Shop"),
        prisma.sale.findMany({
          where: {
            type: "RETAIL",
            saleDate: { gte: trendRange.start, lte: trendRange.end },
            items: { some: { carton: { shopId } } },
          },
          select: { saleDate: true, totalAmount: true },
          orderBy: { saleDate: "asc" },
        }),
      ]);

      const creditSales = await prisma.sale.aggregate({
        where: {
          type: "RETAIL",
          paymentStatus: { in: ["CREDIT", "PARTIAL"] },
          items: { some: { carton: { shopId } } },
        },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      });

      return jsonResponse({
        scoped: true,
        shopName: session.shopName,
        shop: shopStock,
        retail: {
          count: retailSales._count,
          total: decimalToNumber(retailSales._sum.totalAmount),
          collected: decimalToNumber(retailSales._sum.paidAmount),
        },
        customerCredit:
          decimalToNumber(creditSales._sum.totalAmount) -
          decimalToNumber(creditSales._sum.paidAmount),
        customerCreditCount: creditSales._count,
        salespersonCredit: decimalToNumber(myLedger._sum.amount),
        lowStock,
        salesTrend: buildSalesTrend(trendSales),
        recentSales,
      });
    }

    const trendRange = getTrendRange();

    const [
      importCount,
      warehouseStock,
      shopStock,
      wholesaleSales,
      retailSales,
      totalExpenses,
      ledgerEntries,
      recentSales,
      warehouseLowStock,
      shopLowStock,
      trendSales,
    ] = await Promise.all([
      prisma.import.count(),
      getStockSummary({ location: "WAREHOUSE" }),
      getStockSummary({ location: "SHOP" }),
      prisma.sale.aggregate({
        where: { type: "WHOLESALE" },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { type: "RETAIL" },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.salespersonLedger.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { entryDate: "desc" },
        take: 10,
      }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { saleDate: "desc" },
        include: {
          client: { select: { name: true } },
          soldBy: { select: { name: true } },
          retailSoldBy: { select: { name: true } },
        },
      }),
      getLowStockProducts({ location: "WAREHOUSE" }, "Warehouse"),
      getLowStockProducts({ location: "SHOP" }, "Shop"),
      prisma.sale.findMany({
        where: {
          type: { in: ["RETAIL", "WHOLESALE"] },
          saleDate: { gte: trendRange.start, lte: trendRange.end },
        },
        select: { saleDate: true, totalAmount: true },
        orderBy: { saleDate: "asc" },
      }),
    ]);

    const totalHeld = await prisma.salespersonLedger.groupBy({
      by: ["userId"],
      _sum: { amount: true },
    });

    const heldBySalesperson = await Promise.all(
      totalHeld.map(async (item) => {
        const user = await prisma.user.findUnique({
          where: { id: item.userId },
          select: { name: true },
        });
        return {
          name: user?.name || "Unknown",
          amount: decimalToNumber(item._sum.amount),
        };
      })
    );

    const creditSales = await prisma.sale.aggregate({
      where: { paymentStatus: { in: ["CREDIT", "PARTIAL"] } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    });

    const salespersonCreditTotal = heldBySalesperson.reduce(
      (sum, sp) => sum + Math.max(0, sp.amount),
      0
    );

    return jsonResponse({
      scoped: false,
      imports: importCount,
      warehouse: warehouseStock,
      shop: shopStock,
      wholesale: {
        count: wholesaleSales._count,
        total: decimalToNumber(wholesaleSales._sum.totalAmount),
        collected: decimalToNumber(wholesaleSales._sum.paidAmount),
      },
      retail: {
        count: retailSales._count,
        total: decimalToNumber(retailSales._sum.totalAmount),
        collected: decimalToNumber(retailSales._sum.paidAmount),
      },
      expenses: decimalToNumber(totalExpenses._sum.amount),
      customerCredit:
        decimalToNumber(creditSales._sum.totalAmount) -
        decimalToNumber(creditSales._sum.paidAmount),
      customerCreditCount: creditSales._count,
      salespersonCredit: salespersonCreditTotal,
      heldBySalesperson,
      lowStock: [...warehouseLowStock, ...shopLowStock]
        .sort((a, b) => a.stockPercent - b.stockPercent || a.remainingItems - b.remainingItems)
        .slice(0, 8),
      salesTrend: buildSalesTrend(trendSales),
      recentLedger: ledgerEntries,
      recentSales,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
