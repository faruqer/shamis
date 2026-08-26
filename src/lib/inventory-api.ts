export function parseInventoryResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (
    data &&
    typeof data === "object" &&
    "cartons" in data &&
    Array.isArray((data as { cartons: unknown }).cartons)
  ) {
    return (data as { cartons: T[] }).cartons;
  }
  return [];
}

export function parseInventoryMeta(data: unknown): { warehouseLocked: boolean } {
  if (data && typeof data === "object" && "warehouseLocked" in data) {
    return { warehouseLocked: Boolean((data as { warehouseLocked: unknown }).warehouseLocked) };
  }
  return { warehouseLocked: false };
}
