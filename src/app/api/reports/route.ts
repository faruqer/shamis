import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { decimalToNumber } from "@/lib/utils";
import { getImportCostsTotal } from "@/lib/import-utils";
import { getSaleProfit } from "@/lib/sale-utils";
import { Role } from "@prisma/client";

function getDays(period: string) {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

function parseDateParam(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function resolveReportRange(
  period: string,
  date: string | null,
  from: string | null,
  to: string | null
) {
  if (date) {
    const day = startOfDay(parseDateParam(date));
    const end = endOfDay(day);
    return {
      start: day,
      end,
      dayBuckets: [
        {
          key: formatDayKey(day),
          label: formatDayLabel(day),
          date: day,
        },
      ],
    };
  }

  if (from && to) {
    const start = startOfDay(parseDateParam(from));
    const end = endOfDay(parseDateParam(to));
    if (start > end) {
      throw new Error("Start date must be on or before end date");
    }

    const dayBuckets = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dayBuckets.push({
        key: formatDayKey(cursor),
        label: formatDayLabel(cursor),
        date: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { start, end, dayBuckets };
  }

  const days = getDays(period);
  const end = endOfDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const dayBuckets = Array.from({ length: days }, (_, index) => {
    const bucketDate = new Date(start);
    bucketDate.setDate(start.getDate() + index);
    return {
      key: formatDayKey(bucketDate),
      label: formatDayLabel(bucketDate),
      date: bucketDate,
    };
  });

  return { start, end, dayBuckets };
}

function shouldIncludeSale(saleType: string, channel: string) {
  if (channel === "wholesale") return saleType === "WHOLESALE";
  if (channel === "retail") return saleType === "RETAIL";
  return true;
}

type ReportFilters = {
  channel: string;
  saleType: string;
  paymentStatus: string;
  shopId: string | null;
  salespersonId: string | null;
  bankAccountId: string | null;
};

function passesSaleFilters(
  sale: {
    type: string;
    paymentStatus: string;
    shopId: string | null;
    soldById: string | null;
    retailSoldById: string | null;
  },
  filters: ReportFilters
) {
  if (!shouldIncludeSale(sale.type, filters.channel)) return false;
  if (filters.saleType !== "all" && sale.type !== filters.saleType) return false;
  if (filters.paymentStatus !== "all" && sale.paymentStatus !== filters.paymentStatus) return false;
  if (filters.shopId && sale.shopId !== filters.shopId) return false;
  if (filters.salespersonId) {
    const salespersonId = sale.retailSoldById ?? sale.soldById;
    if (salespersonId !== filters.salespersonId) return false;
  }
  return true;
}

function passesExpenseFilters(
  expense: { bankAccountId: string | null },
  filters: ReportFilters
) {
  if (filters.bankAccountId && expense.bankAccountId !== filters.bankAccountId) return false;
  return true;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toProfitItems(
  items: {
    cartonsSold: number;
    itemsSold: number;
    unitPrice: { toString(): string };
    carton: {
      itemsPerCarton: number;
      warehouseLeavingPrice: { toString(): string } | null;
      product: { unitCost: { toString(): string } };
    };
  }[]
) {
  return items.map((item) => ({
    cartonsSold: item.cartonsSold,
    itemsSold: item.itemsSold,
    unitPrice: decimalToNumber(item.unitPrice),
    carton: {
      itemsPerCarton: item.carton.itemsPerCarton,
      warehouseLeavingPrice: item.carton.warehouseLeavingPrice
        ? decimalToNumber(item.carton.warehouseLeavingPrice)
        : null,
      product: { unitCost: item.carton.product.unitCost.toString() },
    },
  }));
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "30d";
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const channel = searchParams.get("channel") ?? "all";
    const saleType = searchParams.get("saleType") ?? "all";
    const paymentStatus = searchParams.get("paymentStatus") ?? "all";
    const shopId = searchParams.get("shopId") || null;
    const salespersonId = searchParams.get("salespersonId") || null;
    const bankAccountId = searchParams.get("bankAccountId") || null;

    const filters: ReportFilters = {
      channel,
      saleType,
      paymentStatus,
      shopId,
      salespersonId,
      bankAccountId,
    };

    const { start, end, dayBuckets } = resolveReportRange(period, date, from, to);

    if (session.role === Role.ADMIN) {
      const [
        sales,
        expenses,
        ledgerEntries,
        imports,
        banks,
        paymentTotals,
        expenseTotals,
        transfersOut,
        transfersIn,
        periodTransfers,
      ] = await Promise.all([
        prisma.sale.findMany({
          where: { saleDate: { gte: start, lte: end } },
          include: {
            client: { select: { name: true } },
            shop: { select: { name: true } },
            soldBy: { select: { name: true } },
            retailSoldBy: { select: { name: true } },
            items: {
              include: {
                carton: {
                  include: { product: true },
                },
              },
            },
          },
          orderBy: { saleDate: "desc" },
        }),
        prisma.expense.findMany({
          where: { expenseDate: { gte: start, lte: end } },
          include: { bankAccount: { select: { name: true } } },
          orderBy: { expenseDate: "desc" },
        }),
        prisma.salespersonLedger.findMany({
          where: { entryDate: { gte: start, lte: end } },
          orderBy: { entryDate: "asc" },
        }),
        prisma.import.findMany({
          where: { importDate: { gte: start, lte: end } },
          include: { costs: true, products: { include: { cartons: true } } },
          orderBy: { importDate: "asc" },
        }),
        prisma.bankAccount.findMany({ orderBy: { name: "asc" } }),
        prisma.payment.groupBy({
          by: ["bankAccountId"],
          where: { bankAccountId: { not: null } },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.expense.groupBy({
          by: ["bankAccountId"],
          where: { bankAccountId: { not: null } },
          _sum: { amount: true },
        }),
        prisma.bankTransfer.groupBy({
          by: ["fromBankAccountId"],
          _sum: { amount: true },
        }),
        prisma.bankTransfer.groupBy({
          by: ["toBankAccountId"],
          _sum: { amount: true },
        }),
        prisma.bankTransfer.findMany({
          where: { transferDate: { gte: start, lte: end } },
          include: {
            fromBank: { select: { name: true } },
            toBank: { select: { name: true } },
          },
          orderBy: { transferDate: "desc" },
        }),
      ]);

      const revenueByDay = new Map(dayBuckets.map((d) => [d.key, 0]));
      const profitByDay = new Map(dayBuckets.map((d) => [d.key, 0]));
      const salesCountByDay = new Map(dayBuckets.map((d) => [d.key, 0]));
      const expensesByDay = new Map(dayBuckets.map((d) => [d.key, 0]));
      const ownerCreditByDay = new Map(dayBuckets.map((d) => [d.key, 0]));

      let wholesaleRevenue = 0;
      let retailRevenue = 0;
      let transferValue = 0;
      let totalProfit = 0;
      let totalExpenses = 0;
      let filteredRevenue = 0;
      let totalCollected = 0;
      let totalOutstanding = 0;
      let wholesaleCount = 0;
      let retailCount = 0;
      let transferCount = 0;
      const paymentBreakdown = { PAID: 0, PARTIAL: 0, CREDIT: 0 };
      const productStats = new Map<string, { name: string; revenue: number; profit: number; itemsSold: number }>();
      const expenseByCategory = new Map<string, number>();
      const salesByShop = new Map<string, { name: string; revenue: number; count: number }>();

      let filteredSalesCount = 0;

      const filteredSales = sales.filter((sale) => passesSaleFilters(sale, filters));
      const filteredExpenses = expenses.filter((expense) => passesExpenseFilters(expense, filters));

      for (const sale of filteredSales) {
        filteredSalesCount += 1;
        const key = formatDayKey(sale.saleDate);
        const revenue = decimalToNumber(sale.totalAmount);
        const paid = decimalToNumber(sale.paidAmount);
        const profit =
          sale.type === "SHOP_TRANSFER"
            ? 0
            : getSaleProfit(decimalToNumber(sale.totalAmount), toProfitItems(sale.items), sale.type);

        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + revenue);
        profitByDay.set(key, (profitByDay.get(key) ?? 0) + profit);
        salesCountByDay.set(key, (salesCountByDay.get(key) ?? 0) + 1);
        totalProfit += profit;
        filteredRevenue += revenue;
        totalCollected += paid;
        totalOutstanding += Math.max(0, revenue - paid);

        if (sale.type === "WHOLESALE") {
          wholesaleRevenue += revenue;
          wholesaleCount += 1;
        }
        if (sale.type === "RETAIL") {
          retailRevenue += revenue;
          retailCount += 1;
          if (sale.shop) {
            const shopStats = salesByShop.get(sale.shopId!) ?? {
              name: sale.shop.name,
              revenue: 0,
              count: 0,
            };
            shopStats.revenue += revenue;
            shopStats.count += 1;
            salesByShop.set(sale.shopId!, shopStats);
          }
        }
        if (sale.type === "SHOP_TRANSFER") {
          transferValue += revenue;
          transferCount += 1;
        }

        if (sale.type !== "SHOP_TRANSFER") {
          paymentBreakdown[sale.paymentStatus] += revenue;
        }

        if (sale.type !== "SHOP_TRANSFER") {
          for (const item of sale.items) {
            const name = item.carton.product.name;
            const itemRevenue = decimalToNumber(item.totalPrice);
            const itemProfit = getSaleProfit(itemRevenue, toProfitItems([item]), sale.type);
            const existing = productStats.get(name) ?? { name, revenue: 0, profit: 0, itemsSold: 0 };
            existing.revenue += itemRevenue;
            existing.profit += itemProfit;
            existing.itemsSold += item.itemsSold;
            productStats.set(name, existing);
          }
        }
      }

      for (const expense of filteredExpenses) {
        const key = formatDayKey(expense.expenseDate);
        const amount = decimalToNumber(expense.amount);
        expensesByDay.set(key, (expensesByDay.get(key) ?? 0) + amount);
        totalExpenses += amount;
        const cat = expense.description.trim() || expense.category;
        expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + amount);
      }

      for (const entry of ledgerEntries) {
        const key = formatDayKey(entry.entryDate);
        ownerCreditByDay.set(key, (ownerCreditByDay.get(key) ?? 0) + decimalToNumber(entry.amount));
      }

      const allLedger = await prisma.salespersonLedger.findMany();
      const ownerCreditTotal = allLedger.reduce((sum, e) => sum + decimalToNumber(e.amount), 0);

      let runningCredit = 0;
      const cumulativeCredit = dayBuckets.map((day) => {
        runningCredit += ownerCreditByDay.get(day.key) ?? 0;
        return runningCredit;
      });

      const topProducts = [...productStats.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15)
        .map((p) => ({
          name: p.name,
          revenue: p.revenue,
          profit: p.profit,
          itemsSold: p.itemsSold,
        }));

      const totalsByBank = new Map(
        paymentTotals
          .filter((row) => row.bankAccountId)
          .map((row) => [
            row.bankAccountId as string,
            {
              balance: decimalToNumber(row._sum.amount),
              paymentCount: row._count.id,
            },
          ])
      );

      for (const row of expenseTotals) {
        if (!row.bankAccountId) continue;
        const stats = totalsByBank.get(row.bankAccountId) ?? { balance: 0, paymentCount: 0 };
        stats.balance -= decimalToNumber(row._sum.amount);
        totalsByBank.set(row.bankAccountId, stats);
      }

      for (const row of transfersOut) {
        if (!row.fromBankAccountId) continue;
        const stats = totalsByBank.get(row.fromBankAccountId) ?? { balance: 0, paymentCount: 0 };
        stats.balance -= decimalToNumber(row._sum.amount);
        totalsByBank.set(row.fromBankAccountId, stats);
      }

      for (const row of transfersIn) {
        if (!row.toBankAccountId) continue;
        const stats = totalsByBank.get(row.toBankAccountId) ?? { balance: 0, paymentCount: 0 };
        stats.balance += decimalToNumber(row._sum.amount);
        totalsByBank.set(row.toBankAccountId, stats);
      }

      const bankBalances = banks.map((bank) => ({
        id: bank.id,
        name: bank.name,
        isActive: bank.isActive,
        balance: totalsByBank.get(bank.id)?.balance ?? 0,
        paymentCount: totalsByBank.get(bank.id)?.paymentCount ?? 0,
      }));

      const totalBankBalance = bankBalances.reduce((sum, bank) => sum + bank.balance, 0);
      const transfersTotal = periodTransfers.reduce(
        (sum, transfer) => sum + decimalToNumber(transfer.amount),
        0
      );

      const importValue = imports.reduce((sum, imp) => {
        const productValue = imp.products.reduce((pSum, product) => {
          const cartons = product.cartons[0];
          if (!cartons) return pSum;
          return pSum + decimalToNumber(product.unitCost) * cartons.totalCartons * cartons.itemsPerCarton;
        }, 0);
        const costs = imp.costs?.map((c) => ({ name: c.name, amount: c.amount.toString() }));
        return sum + productValue + getImportCostsTotal({ products: [], costs, customCost: imp.customCost.toString() });
      }, 0);

      const rangeMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - rangeMs);
      const prevSales = await prisma.sale.aggregate({
        where: {
          saleDate: { gte: prevStart, lte: prevEnd },
          ...(channel === "wholesale"
            ? { type: "WHOLESALE" as const }
            : channel === "retail"
              ? { type: "RETAIL" as const }
              : {}),
        },
        _sum: { totalAmount: true },
      });
      const currentRevenue = filteredRevenue;
      const prevRevenue = decimalToNumber(prevSales._sum.totalAmount);
      const revenueTrend =
        prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : 0;

      return jsonResponse({
        scoped: "admin" as const,
        period,
        channel,
        dateRange: {
          from: start.toISOString(),
          to: end.toISOString(),
        },
        summary: {
          totalRevenue: filteredRevenue,
          wholesaleRevenue,
          retailRevenue,
          transferValue,
          totalProfit,
          totalExpenses,
          netProfit: totalProfit - totalExpenses,
          ownerCreditTotal,
          importValue,
          importCount: imports.length,
          salesCount: filteredSalesCount,
          wholesaleCount,
          retailCount,
          transferCount,
          totalCollected,
          totalOutstanding,
          totalBankBalance,
          transfersTotal,
          avgSale: filteredSalesCount > 0 ? filteredRevenue / filteredSalesCount : 0,
          avgProfit: filteredSalesCount > 0 ? totalProfit / filteredSalesCount : 0,
          profitMargin: filteredRevenue > 0 ? Math.round((totalProfit / filteredRevenue) * 100) : 0,
          expenseCount: filteredExpenses.length,
          revenueTrend,
        },
        filters: {
          channel,
          saleType,
          paymentStatus,
          shopId,
          salespersonId,
          bankAccountId,
        },
        trends: {
          labels: dayBuckets.map((d) => d.label),
          revenue: dayBuckets.map((d) => revenueByDay.get(d.key) ?? 0),
          profit: dayBuckets.map((d) => profitByDay.get(d.key) ?? 0),
          salesCount: dayBuckets.map((d) => salesCountByDay.get(d.key) ?? 0),
          expenses: dayBuckets.map((d) => expensesByDay.get(d.key) ?? 0),
          ownerCreditDaily: dayBuckets.map((d) => ownerCreditByDay.get(d.key) ?? 0),
          ownerCreditCumulative: cumulativeCredit,
        },
        paymentBreakdown: [
          { label: "Paid", value: paymentBreakdown.PAID, color: "#5a8a6a" },
          { label: "Partial", value: paymentBreakdown.PARTIAL, color: "#c4a35a" },
          { label: "Credit", value: paymentBreakdown.CREDIT, color: "#b85c5c" },
        ],
        topProducts,
        expenseBreakdown: [...expenseByCategory.entries()]
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value),
        salesByShop: [...salesByShop.values()].sort((a, b) => b.revenue - a.revenue),
        bankBalances,
        recentSales: filteredSales.slice(0, 20).map((sale) => ({
            id: sale.id,
            saleNumber: sale.saleNumber,
            type: sale.type,
            date: sale.saleDate.toISOString(),
            client: sale.client?.name ?? null,
            shop: sale.shop?.name ?? null,
            salesperson: sale.retailSoldBy?.name ?? sale.soldBy?.name ?? null,
            total: decimalToNumber(sale.totalAmount),
            paid: decimalToNumber(sale.paidAmount),
            status: sale.paymentStatus,
          })),
        recentExpenses: filteredExpenses.slice(0, 20).map((expense) => ({
          id: expense.id,
          description: expense.description,
          date: expense.expenseDate.toISOString(),
          amount: decimalToNumber(expense.amount),
          bank: expense.bankAccount?.name ?? null,
        })),
        recentTransfers: periodTransfers.slice(0, 15).map((transfer) => ({
          id: transfer.id,
          date: transfer.transferDate.toISOString(),
          fromBank: transfer.fromBank.name,
          toBank: transfer.toBank.name,
          amount: decimalToNumber(transfer.amount),
          notes: transfer.notes,
        })),
        saleTypeBreakdown: [
          { label: "Wholesale", value: wholesaleRevenue, color: "#6b9080" },
          { label: "Retail", value: retailRevenue, color: "#5a8a6a" },
          { label: "Shop Transfer", value: transferValue, color: "#8aab9a" },
        ],
      });
    }

    throw new Error("Forbidden");
  } catch (error) {
    return handleApiError(error);
  }
}
