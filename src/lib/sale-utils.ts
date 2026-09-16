export function getCartonCost(unitCost: number | string, itemsPerCarton: number) {
  const cost = typeof unitCost === "string" ? parseFloat(unitCost) : unitCost;
  return cost * itemsPerCarton;
}

export function getDefaultSaleUnitPrice(
  unitCost: number | string,
  itemsPerCarton: number,
  sellMode: "carton" | "item"
) {
  const itemCost = typeof unitCost === "string" ? parseFloat(unitCost) : unitCost;
  return sellMode === "carton" ? itemCost * itemsPerCarton : itemCost;
}

export function calculateLineTotal(
  sellMode: "carton" | "item",
  quantity: number,
  unitPrice: number
) {
  return quantity * unitPrice;
}

export function calculateSaleLineTotal(
  cartonsSold: number,
  itemsSold: number,
  unitPrice: number
) {
  if (cartonsSold > 0) return cartonsSold * unitPrice;
  return itemsSold * unitPrice;
}

export function getSaleItemQuantity(
  cartonsSold: number,
  itemsSold: number,
  itemsPerCarton: number
) {
  if (itemsSold > 0) return itemsSold;
  if (cartonsSold > 0) return cartonsSold * itemsPerCarton;
  return 0;
}

export interface SaleProfitItem {
  cartonsSold: number;
  itemsSold: number;
  unitPrice?: number | string;
  /** Cost per item recorded when the sale was made; older sales fall back to current prices. */
  costPrice?: number | string | null;
  carton: {
    itemsPerCarton: number;
    warehouseLeavingPrice?: number | string | null;
    product: { unitCost: number | string };
  };
}

function parseAmount(value: number | string | { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseFloat(value) || 0;
  return parseFloat(value.toString()) || 0;
}

export function getSaleItemCost(
  cartonsSold: number,
  itemsSold: number,
  itemsPerCarton: number,
  unitCost: number | string
) {
  const cost = parseAmount(unitCost);
  return getSaleItemQuantity(cartonsSold, itemsSold, itemsPerCarton) * cost;
}

export function getRetailSaleItemCost(
  cartonsSold: number,
  itemsSold: number,
  itemsPerCarton: number,
  warehouseLeavingPrice?: string | number | null,
  importUnitCost?: string | number | null
) {
  const unitCost = parseAmount(warehouseLeavingPrice ?? importUnitCost);
  return getRetailSaleItemQuantity(cartonsSold, itemsSold, itemsPerCarton) * unitCost;
}

/** Retail lines store full cartons and loose items separately, so both count. */
export function getRetailSaleItemQuantity(
  cartonsSold: number,
  itemsSold: number,
  itemsPerCarton: number
) {
  return cartonsSold * itemsPerCarton + itemsSold;
}

export function getSaleCost(items: SaleProfitItem[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      getSaleItemCost(
        item.cartonsSold,
        item.itemsSold,
        item.carton.itemsPerCarton,
        item.costPrice ?? item.carton.product.unitCost
      ),
    0
  );
}

export function getRetailSaleCost(items: SaleProfitItem[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      getRetailSaleItemCost(
        item.cartonsSold,
        item.itemsSold,
        item.carton.itemsPerCarton,
        item.costPrice ?? item.carton.warehouseLeavingPrice,
        item.carton.product.unitCost
      ),
    0
  );
}

export function getSaleProfit(
  totalAmount: number | string,
  items: SaleProfitItem[],
  saleType: "WHOLESALE" | "SHOP_TRANSFER" | "RETAIL" = "WHOLESALE"
) {
  const revenue = parseAmount(totalAmount);
  if (saleType === "SHOP_TRANSFER") return 0;
  if (saleType === "RETAIL") return revenue - getRetailSaleCost(items);
  return revenue - getSaleCost(items);
}
