"use client";

import { ShopTransferForm } from "@/components/sales/shop-transfer-form";
import { WholesaleSaleForm } from "@/components/sales/wholesale-sale-form";
import { RetailSaleForm } from "@/components/sales/retail-sale-form";
import { Role } from "@prisma/client";

export type SaleType = "WHOLESALE" | "SHOP_TRANSFER" | "RETAIL";

interface SaleFormProps {
  user: { id: string; name: string; role: Role; email: string; shopId?: string | null; shopName?: string | null };
  type: SaleType;
  mode?: "page" | "modal";
  initialCartonId?: string;
  saleId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SaleForm(props: SaleFormProps) {
  if (props.type === "SHOP_TRANSFER") {
    return (
      <ShopTransferForm
        mode={props.mode}
        initialCartonId={props.initialCartonId}
        fixedShopId={props.user.role === Role.SALESPERSON ? props.user.shopId ?? undefined : undefined}
        fixedShopName={
          props.user.role === Role.SALESPERSON
            ? ("shopName" in props.user ? (props.user.shopName as string | null) : null) ?? undefined
            : undefined
        }
        onSuccess={props.onSuccess}
        onCancel={props.onCancel}
      />
    );
  }
  if (props.type === "WHOLESALE") {
    return (
      <WholesaleSaleForm
        user={props.user}
        mode={props.mode}
        initialCartonId={props.initialCartonId}
        onSuccess={props.onSuccess}
        onCancel={props.onCancel}
      />
    );
  }
  return (
    <RetailSaleForm
      user={props.user}
      mode={props.mode}
      initialCartonId={props.initialCartonId}
      saleId={props.saleId}
      onSuccess={props.onSuccess}
      onCancel={props.onCancel}
    />
  );
}
