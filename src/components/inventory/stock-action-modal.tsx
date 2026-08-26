"use client";

import { motion } from "framer-motion";
import { ShoppingCart, Store, Receipt, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

export type StockActionType = "WHOLESALE" | "SHOP_TRANSFER" | "RETAIL";

interface StockActionModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: StockActionType) => void;
  product: {
    name: string;
    unitCost: string;
    retailUnitPrice?: string | null;
    batchNumber?: string;
    location: string;
    remainingCartons: number;
    remainingItems: number;
  } | null;
  userRole: Role;
}

const actions: {
  type: StockActionType;
  title: string;
  description: string;
  icon: typeof ShoppingCart;
  color: string;
  iconBg: string;
  locations: string[];
  adminOnly?: boolean;
  salespersonOnly?: boolean;
}[] = [
  {
    type: "WHOLESALE" as const,
    title: "Wholesale Sale",
    description: "Sell directly to a wholesale client from warehouse",
    icon: ShoppingCart,
    color: "hover:border-[#a8c4d8] hover:bg-[#dce8f0]",
    iconBg: "bg-[#ccdbe8] text-[#2d5a7a]",
    locations: ["WAREHOUSE"],
    adminOnly: true,
  },
  {
    type: "SHOP_TRANSFER" as const,
    title: "Transfer to Shop",
    description: "Move stock from warehouse to your retail shop",
    icon: Store,
    color: "hover:border-primary/40 hover:bg-secondary",
    iconBg: "bg-primary-light text-primary-dark",
    locations: ["WAREHOUSE"],
  },
  {
    type: "RETAIL" as const,
    title: "Retail Sale",
    description: "Sell items to a customer from the shop",
    icon: Receipt,
    color: "hover:border-[#a8cfc0] hover:bg-secondary",
    iconBg: "bg-[#c8e0d4] text-[#1e5a42]",
    locations: ["SHOP"],
    salespersonOnly: true,
  },
];

export function StockActionModal({ open, onClose, onSelect, product, userRole }: StockActionModalProps) {
  if (!product) return null;

  const isSalesperson = userRole === Role.SALESPERSON;
  const displayPrice = isSalesperson
    ? product.retailUnitPrice
      ? parseFloat(product.retailUnitPrice)
      : 0
    : parseFloat(product.unitCost) || 0;

  const availableActions = actions.filter((action) => {
    if (action.adminOnly && userRole !== Role.ADMIN) return false;
    if ("salespersonOnly" in action && action.salespersonOnly && userRole !== Role.SALESPERSON) {
      return false;
    }
    return action.locations.includes(product.location);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move Stock"
      description={`Choose what to do with "${product.name}"`}
    >
      <div className="px-6 py-4 space-y-4">
        <div className="rounded-xl bg-muted/60 p-4">
          <p className="font-medium">{product.name}</p>
          {!isSalesperson && product.batchNumber && (
            <p className="text-xs text-muted-foreground mt-1">Batch {product.batchNumber}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {(isSalesperson ? displayPrice > 0 : true) && (
              <>
                <span>
                  {formatCurrency(displayPrice)}/item
                  {isSalesperson ? " retail" : ""}
                </span>
                <span className="text-muted-foreground">·</span>
              </>
            )}
            <span>{product.remainingCartons} cartons</span>
            <span className="text-muted-foreground">·</span>
            <span>{product.remainingItems} items</span>
          </div>
        </div>

        <div className="space-y-2">
          {availableActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.type}
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelect(action.type)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-all duration-200",
                  action.color
                )}
              >
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", action.iconBg)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </motion.button>
            );
          })}
        </div>

        {availableActions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No actions available for this stock location.
          </p>
        )}
      </div>
    </Modal>
  );
}
