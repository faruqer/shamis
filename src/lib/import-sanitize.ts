import { Role } from "@prisma/client";

type ImportProductRecord = {
  unitCost?: unknown;
  productCustomCost?: unknown;
  taxSeaFreight?: unknown;
  [key: string]: unknown;
};

type ImportRecord = {
  customCost?: unknown;
  creditAmount?: unknown;
  creditPaidAmount?: unknown;
  creditPaid?: unknown;
  costs?: unknown;
  creditPersons?: unknown;
  products?: ImportProductRecord[];
  [key: string]: unknown;
};

export function sanitizeImportForRole<T extends ImportRecord>(importRecord: T, role: Role): T {
  if (role === Role.ADMIN) return importRecord;

  const { costs: _costs, creditPersons: _creditPersons, ...rest } = importRecord;

  return {
    ...rest,
    customCost: "0",
    creditAmount: "0",
    creditPaidAmount: "0",
    creditPaid: false,
    costs: [],
    creditPersons: [],
    products: (importRecord.products ?? []).map(
      ({ productCustomCost: _productCustomCost, taxSeaFreight: _taxSeaFreight, ...product }) =>
        product
    ),
  } as T;
}

export function sanitizeImportsForRole<T extends ImportRecord>(imports: T[], role: Role): T[] {
  return imports.map((importRecord) => sanitizeImportForRole(importRecord, role));
}
