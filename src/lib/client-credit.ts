import prisma from "@/lib/prisma";
import { decimalToNumber, formatPaymentMethod, getSalePaymentMethods } from "@/lib/utils";
import { Prisma } from "@prisma/client";

function getProductNames(items: { carton: { product: { name: string } } }[]) {
  return [...new Set(items.map((item) => item.carton.product.name))].join(", ");
}

type SaleItemRow = {
  cartonsSold: number;
  itemsSold: number;
  unitPrice: { toString(): string };
  totalPrice: { toString(): string };
  carton: { product: { name: string } };
};

function mapSaleItems(items: SaleItemRow[]) {
  return items.map((item) => ({
    productName: item.carton.product.name,
    cartonsSold: item.cartonsSold,
    itemsSold: item.itemsSold,
    unitPrice: decimalToNumber(item.unitPrice),
    totalPrice: decimalToNumber(item.totalPrice),
  }));
}

const saleInclude = {
  client: { select: { id: true, name: true } },
  items: {
    include: {
      carton: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { paymentDate: "desc" as const },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      paymentMethod: true,
      bankAccount: { select: { name: true } },
    },
  },
} satisfies Prisma.SaleInclude;

export async function buildClientCreditData(options?: {
  shopId?: string;
  saleTypes?: ("WHOLESALE" | "RETAIL")[];
}) {
  const shopId = options?.shopId;
  const saleTypes = options?.saleTypes ?? ["WHOLESALE", "RETAIL"];
  const shopItemFilter = shopId ? { items: { some: { carton: { shopId } } } } : {};

  const [creditSales, creditActivity] = await Promise.all([
    prisma.sale.findMany({
      where: {
        type: { in: saleTypes },
        paymentStatus: { in: ["CREDIT", "PARTIAL"] },
        ...shopItemFilter,
      },
      include: {
        ...saleInclude,
        payments: {
          select: { paymentMethod: true, amount: true, bankAccount: { select: { name: true } } },
        },
      },
      orderBy: { saleDate: "asc" },
    }),
    prisma.sale.findMany({
      where: {
        type: { in: saleTypes },
        clientId: { not: null },
        ...shopItemFilter,
        OR: [{ paymentStatus: { in: ["CREDIT", "PARTIAL"] } }, { payments: { some: {} } }],
      },
      include: saleInclude,
      orderBy: { saleDate: "desc" },
    }),
  ]);

  const clientBalances = new Map<string, { clientId: string; clientName: string; amount: number }>();

  for (const sale of creditActivity) {
    const clientId = sale.clientId ?? `unknown-${sale.id}`;
    const clientName = sale.client?.name ?? "Unknown client";
    if (!clientBalances.has(clientId)) {
      clientBalances.set(clientId, { clientId, clientName, amount: 0 });
    }
  }

  for (const sale of creditSales) {
    const outstanding = decimalToNumber(sale.totalAmount) - decimalToNumber(sale.paidAmount);
    if (outstanding <= 0) continue;

    const clientId = sale.clientId ?? `unknown-${sale.id}`;
    const clientName = sale.client?.name ?? "Unknown client";
    const existing = clientBalances.get(clientId);

    if (existing) {
      existing.amount += outstanding;
    } else {
      clientBalances.set(clientId, { clientId, clientName, amount: outstanding });
    }
  }

  const allClientBalances = [...clientBalances.values()].sort((a, b) => {
    if (a.amount > 0 && b.amount === 0) return -1;
    if (a.amount === 0 && b.amount > 0) return 1;
    if (a.amount > 0 && b.amount > 0) return b.amount - a.amount;
    return a.clientName.localeCompare(b.clientName);
  });

  const clientCredit = allClientBalances
    .filter((client) => client.amount > 0)
    .reduce((sum, client) => sum + client.amount, 0);

  const clientHistory = creditActivity.flatMap((sale) => {
    const productNames = getProductNames(sale.items);
    const clientName = sale.client?.name ?? "Unknown client";
    const entries: {
      id: string;
      category: "CLIENT";
      type: string;
      amount: number;
      description: string;
      entryDate: Date;
      clientId?: string;
      clientName: string;
      productNames: string;
      items: ReturnType<typeof mapSaleItems>;
      paymentMethod?: string | null;
    }[] = [];

    entries.push({
      id: `sale-${sale.id}`,
      category: "CLIENT",
      type: "CREDIT_SALE",
      amount: decimalToNumber(sale.totalAmount),
      description: productNames,
      entryDate: sale.saleDate,
      clientId: sale.clientId ?? undefined,
      clientName,
      productNames,
      items: mapSaleItems(sale.items),
    });

    for (const payment of sale.payments) {
      const method =
        payment.paymentMethod === "BANK_TRANSFER" && payment.bankAccount?.name
          ? `Bank Transfer (${payment.bankAccount.name})`
          : formatPaymentMethod(payment.paymentMethod);

      entries.push({
        id: `payment-${payment.id}`,
        category: "CLIENT",
        type: "PAYMENT",
        amount: decimalToNumber(payment.amount),
        description: productNames,
        entryDate: payment.paymentDate,
        clientId: sale.clientId ?? undefined,
        clientName,
        productNames,
        items: mapSaleItems(sale.items),
        paymentMethod: method,
      });
    }

    return entries;
  });

  return {
    clientCredit,
    clientBalances: allClientBalances,
    creditSales: creditSales
      .map((sale) => ({
        id: sale.id,
        clientId: sale.clientId ?? undefined,
        productNames: getProductNames(sale.items),
        clientName: sale.client?.name ?? "Unknown client",
        totalAmount: decimalToNumber(sale.totalAmount),
        paidAmount: decimalToNumber(sale.paidAmount),
        outstanding: decimalToNumber(sale.totalAmount) - decimalToNumber(sale.paidAmount),
        paymentStatus: sale.paymentStatus,
        paymentMethod: getSalePaymentMethods(sale.payments),
        saleDate: sale.saleDate,
        items: mapSaleItems(sale.items),
      }))
      .filter((sale) => sale.outstanding > 0),
    clientHistory,
  };
}
