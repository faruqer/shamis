"use client";

import { ArrowLeftRight, Receipt, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime, formatPaymentMethod } from "@/lib/utils";
import { SaleType } from "@prisma/client";

export interface LedgerSaleItem {
  productName: string;
  cartonsSold: number;
  itemsSold: number;
  itemsPerCarton: number;
  unitPrice: number;
  totalPrice: number;
}

export interface LedgerSale {
  id: string;
  saleNumber: string;
  type: SaleType;
  saleDate: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  clientName: string | null;
  shopName: string | null;
  items: LedgerSaleItem[];
}

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number | string;
  description: string;
  entryDate: string;
  sale?: LedgerSale | null;
  payment?: {
    amount: number;
    paymentMethod: string | null;
    paymentDate: string;
    notes: string | null;
    bankName: string | null;
  } | null;
  expense?: {
    description: string;
    category: string;
    bankName: string | null;
  } | null;
}

const SALE_TYPE_CONFIG: Record<
  SaleType,
  { label: string; variant: "info" | "primary" | "success"; icon: React.ReactNode }
> = {
  WHOLESALE: { label: "Wholesale", variant: "info", icon: <ShoppingCart className="h-3 w-3" /> },
  SHOP_TRANSFER: {
    label: "Shop Transfer",
    variant: "primary",
    icon: <ArrowLeftRight className="h-3 w-3" />,
  },
  RETAIL: { label: "Retail", variant: "success", icon: <Receipt className="h-3 w-3" /> },
};

/**
 * "2 cartons · 960 pcs", or "12 pcs" for a loose sale. The piece total matters:
 * unit price is per piece, so without it the line's arithmetic looks wrong.
 */
function formatQuantity(item: LedgerSaleItem) {
  const pieces = item.cartonsSold * item.itemsPerCarton + item.itemsSold;
  const parts: string[] = [];
  if (item.cartonsSold > 0) {
    parts.push(`${item.cartonsSold} carton${item.cartonsSold === 1 ? "" : "s"}`);
  }
  if (pieces > 0) {
    parts.push(`${pieces.toLocaleString()} pcs`);
  }
  return parts.join(" · ") || "—";
}

/**
 * What a ledger row is about, in words. Entries tied to a sale show the sale's
 * own log data — products, quantities, who bought — rather than its number;
 * everything else falls back to the stored description.
 */
export function LedgerEntryDetails({ entry }: { entry: LedgerEntry }) {
  const { sale, expense, payment } = entry;

  if (sale) {
    const config = SALE_TYPE_CONFIG[sale.type];
    const counterparty = sale.clientName ?? sale.shopName;
    const outstanding = sale.totalAmount - sale.paidAmount;

    return (
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={config.variant}>
            <span className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </span>
          </Badge>
          {counterparty && (
            <span className="text-sm font-semibold break-words">{counterparty}</span>
          )}
        </div>

        <ul className="space-y-0.5">
          {sale.items.map((item, index) => (
            <li key={index} className="text-sm break-words">
              <span className="font-medium">{item.productName}</span>
              <span className="text-muted-foreground">
                {" "}
                — {formatQuantity(item)} @ {formatCurrency(item.unitPrice)} ={" "}
                {formatCurrency(item.totalPrice)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Sale total {formatCurrency(sale.totalAmount)} · paid {formatCurrency(sale.paidAmount)}
          {outstanding > 0 && ` · ${formatCurrency(outstanding)} outstanding`}
        </p>

        <p className="text-xs text-muted-foreground">
          {formatDateTime(entry.entryDate)}
          {payment?.paymentMethod && ` · ${formatPaymentMethod(payment.paymentMethod)}`}
          {payment?.bankName && ` (${payment.bankName})`}
        </p>
        {payment?.notes && (
          <p className="text-xs text-muted-foreground break-words">{payment.notes}</p>
        )}
      </div>
    );
  }

  if (expense) {
    return (
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium break-words">{expense.description}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(entry.entryDate)}
          {expense.bankName && ` · ${expense.bankName}`}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-medium break-words">{entry.description}</p>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(entry.entryDate)}
        {payment?.paymentMethod && ` · ${formatPaymentMethod(payment.paymentMethod)}`}
        {payment?.bankName && ` (${payment.bankName})`}
      </p>
      {payment?.notes && (
        <p className="text-xs text-muted-foreground break-words">{payment.notes}</p>
      )}
    </div>
  );
}

export function ledgerBadgeVariant(type: string) {
  switch (type) {
    case "COLLECTION":
      return "success" as const;
    case "EXPENSE":
      return "danger" as const;
    case "HANDOVER":
      return "info" as const;
    default:
      return "default" as const;
  }
}
