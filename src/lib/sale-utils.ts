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
  carton: {
    itemsPerCarton: number;
    warehouseLeavingPrice?: string | number | null;
    product: { unitCost: string };
  };
}

function parseAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "string" ? parseFloat(value) : value;
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
  return getSaleItemQuantity(cartonsSold, itemsSold, itemsPerCarton) * unitCost;
}

export function getSaleCost(items: SaleProfitItem[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      getSaleItemCost(
        item.cartonsSold,
        item.itemsSold,
        item.carton.itemsPerCarton,
        item.carton.product.unitCost
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
        item.carton.warehouseLeavingPrice,
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
