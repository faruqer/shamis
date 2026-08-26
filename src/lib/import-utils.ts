export interface ImportCartonLike {
  totalCartons: number;
  itemsPerCarton: number;
  remainingCartons?: number;
  remainingItems?: number;
}

export interface ImportProductLike {
  unitCost: number | string;
  cartons: ImportCartonLike[];
}

export interface ImportCostLike {
  name: string;
  amount: number | string;
}

export interface ImportLike {
  customCost?: number | string | null;
  costs?: ImportCostLike[];
  creditAmount?: number | string | null;
  creditPaidAmount?: number | string | null;
  creditPaid?: boolean;
  products: ImportProductLike[];
}

export function getProductTotalItems(cartons: ImportCartonLike[]) {
  const carton = cartons[0];
  if (!carton) return 0;
  return carton.totalCartons * carton.itemsPerCarton;
}

export function getProductValue(unitCost: number | string, cartons: ImportCartonLike[]) {
  const cost = typeof unitCost === "string" ? parseFloat(unitCost) : unitCost;
  return cost * getProductTotalItems(cartons);
}

export function getImportProductsValue(importRecord: ImportLike) {
  const products = importRecord.products ?? [];
  return products.reduce(
    (sum, product) => sum + getProductValue(product.unitCost, product.cartons ?? []),
    0
  );
}

function parseAmount(value: number | string) {
  return typeof value === "string" ? parseFloat(value) || 0 : value;
}

export function getImportCostsTotal(importRecord: ImportLike) {
  if (importRecord.costs && importRecord.costs.length > 0) {
    return importRecord.costs.reduce((sum, cost) => sum + parseAmount(cost.amount), 0);
  }

  const cost = importRecord.customCost;
  if (cost === null || cost === undefined) return 0;
  return parseAmount(cost);
}

export function getImportCustomCost(importRecord: ImportLike) {
  return getImportCostsTotal(importRecord);
}

export function getImportTotalValue(importRecord: ImportLike) {
  return getImportProductsValue(importRecord) + getImportCustomCost(importRecord);
}

export function getImportCreditPaidAmount(importRecord: ImportLike) {
  return parseAmount(importRecord.creditPaidAmount ?? 0);
}

export function getImportCreditOutstanding(importRecord: ImportLike) {
  const total = parseAmount(importRecord.creditAmount ?? 0);
  if (total <= 0 || importRecord.creditPaid) return 0;
  return Math.max(0, total - getImportCreditPaidAmount(importRecord));
}

export function getImportRemainingStock(importRecord: ImportLike) {
  const products = importRecord.products ?? [];
  return products.reduce(
    (acc, product) => {
      for (const carton of product.cartons ?? []) {
        acc.cartons += carton.remainingCartons ?? carton.totalCartons;
        acc.items += carton.remainingItems ?? getProductTotalItems([carton]);
      }
      return acc;
    },
    { cartons: 0, items: 0 }
  );
}

const emptyImportsSummary = {
  importCount: 0,
  totalValue: 0,
  totalProducts: 0,
  remainingCartons: 0,
  remainingItems: 0,
  totalCredit: 0,
};

export function getImportsSummary(imports: ImportLike[] | null | undefined) {
  if (!Array.isArray(imports)) return emptyImportsSummary;

  return imports.reduce(
    (acc, imp) => {
      const stock = getImportRemainingStock(imp);
      acc.totalValue += getImportTotalValue(imp);
      acc.totalProducts += imp.products?.length ?? 0;
      acc.remainingCartons += stock.cartons;
      acc.remainingItems += stock.items;
      acc.totalCredit += getImportCreditOutstanding(imp);
      return acc;
    },
    { ...emptyImportsSummary, importCount: imports.length }
  );
}
