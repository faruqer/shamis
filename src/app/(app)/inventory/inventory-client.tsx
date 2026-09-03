"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Warehouse, Store, Search, Package, X, Lock, Unlock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { StockActionModal, StockActionType } from "@/components/inventory/stock-action-modal";
import { ShopReturnForm } from "@/components/inventory/shop-return-form";
import { SaleForm } from "@/components/sales/sale-form";
import { formatCurrency } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { parseInventoryMeta, parseInventoryResponse } from "@/lib/inventory-api";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

interface CartonRecord {
  id: string;
  cartonNumber: string;
  itemsPerCarton: number;
  totalCartons: number;
  remainingCartons: number;
  remainingItems: number;
  location: string;
  warehouseLeavingPrice?: string | null;
  retailUnitPrice?: string | null;
  shop?: { id: string; name: string } | null;
  product: {
    name: string;
    unitCost?: string;
    import?: { batchNumber?: string; importDate?: string };
  };
}

interface InventoryUser {
  id: string;
  name: string;
  role: Role;
  email: string;
  shopId?: string | null;
  shopName?: string | null;
}

export function InventoryClient({ user }: { user: InventoryUser }) {
  const isShopStaff = user.role === Role.SALESPERSON;
  const isAdmin = user.role === Role.ADMIN;
  const [shopInventory, setShopInventory] = useState<CartonRecord[]>([]);
  const [warehouseInventory, setWarehouseInventory] = useState<CartonRecord[]>([]);
  const [warehouseLocked, setWarehouseLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lockLoading, setLockLoading] = useState(false);
  const [staffTab, setStaffTab] = useState<"SHOP" | "WAREHOUSE">("SHOP");
  const [filter, setFilter] = useState<"ALL" | "WAREHOUSE" | "SHOP">(isShopStaff ? "SHOP" : "WAREHOUSE");
  const [shopFilter, setShopFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedCarton, setSelectedCarton] = useState<CartonRecord | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [saleType, setSaleType] = useState<StockActionType | null>(null);

  const loadInventory = useCallback(() => {
    setLoading(true);

    if (isShopStaff) {
      if (staffTab === "SHOP") {
        fetch("/api/inventory?location=SHOP")
          .then((r) => r.json())
          .then((shopData) => {
            setShopInventory(parseInventoryResponse<CartonRecord>(shopData));
          })
          .finally(() => setLoading(false));
        return;
      }

      fetch("/api/inventory?location=WAREHOUSE")
        .then((r) => r.json())
        .then((warehouseData) => {
          setWarehouseInventory(parseInventoryResponse<CartonRecord>(warehouseData));
          setWarehouseLocked(parseInventoryMeta(warehouseData).warehouseLocked);
        })
        .finally(() => setLoading(false));
      return;
    }

    fetch("/api/inventory")
      .then((r) => r.json())
      .then((data) => {
        const items = parseInventoryResponse<CartonRecord>(data);
        setShopInventory(items.filter((item) => item.location === "SHOP"));
        setWarehouseInventory(items.filter((item) => item.location === "WAREHOUSE"));
      })
      .finally(() => setLoading(false));

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setWarehouseLocked(Boolean(data.warehouseLocked)))
      .catch(() => {});
  }, [isShopStaff, staffTab]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (!isShopStaff) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setWarehouseLocked(Boolean(data.warehouseLocked)))
      .catch(() => {});
  }, [isShopStaff]);

  useEffect(() => {
    if (filter !== "SHOP") setShopFilter("ALL");
  }, [filter]);

  useEffect(() => {
    if (isShopStaff) {
      setFilter(staffTab);
    }
  }, [isShopStaff, staffTab]);

  const warehouseLockedForStaff = isShopStaff && warehouseLocked;

  const inventory = useMemo(() => {
    if (isShopStaff) {
      if (staffTab === "SHOP") return shopInventory;
      if (warehouseLockedForStaff) return [];
      return warehouseInventory;
    }
    if (filter === "ALL") return [...warehouseInventory, ...shopInventory];
    if (filter === "WAREHOUSE") return warehouseInventory;
    return shopInventory;
  }, [
    isShopStaff,
    staffTab,
    warehouseLockedForStaff,
    shopInventory,
    warehouseInventory,
    filter,
  ]);

  async function toggleWarehouseLock() {
    setLockLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseLocked: !warehouseLocked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update warehouse lock");
      setWarehouseLocked(Boolean(data.warehouseLocked));
    } catch {
      // ignore — admin can retry
    } finally {
      setLockLoading(false);
    }
  }

  const shopOptions = useMemo(() => {
    const shops = new Map<string, string>();
    for (const item of shopInventory) {
      if (item.shop) {
        shops.set(item.shop.id, item.shop.name);
      }
    }
    return [...shops.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [shopInventory]);

  const warehouseCount = warehouseInventory.length;
  const shopCount = shopInventory.length;

  function cartonStockValue(carton: CartonRecord) {
    const isShopStock = carton.location !== "WAREHOUSE";
    const unitCost = carton.product.unitCost ? parseFloat(carton.product.unitCost) : 0;
    const transferPrice = carton.warehouseLeavingPrice
      ? parseFloat(carton.warehouseLeavingPrice)
      : null;
    const retailPrice = carton.retailUnitPrice ? parseFloat(carton.retailUnitPrice) : null;
    const displayUnitPrice = isShopStock
      ? transferPrice ?? retailPrice ?? unitCost
      : unitCost;
    return displayUnitPrice * carton.remainingItems;
  }

  const stockValueTotals = useMemo(
    () => ({
      warehouse: warehouseInventory.reduce((sum, carton) => sum + cartonStockValue(carton), 0),
      shop: shopInventory.reduce((sum, carton) => sum + cartonStockValue(carton), 0),
    }),
    [warehouseInventory, shopInventory]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inventory
      .filter((item) => {
        const matchesLocation = filter === "ALL" || item.location === filter;
        const matchesShop =
          filter !== "SHOP" || shopFilter === "ALL" || item.shop?.id === shopFilter;
        const matchesSearch =
          !query ||
          item.product.name.toLowerCase().includes(query) ||
          (!isShopStaff && item.product.import?.batchNumber?.toLowerCase().includes(query)) ||
          (isAdmin && item.shop?.name.toLowerCase().includes(query));
        return matchesLocation && matchesShop && matchesSearch;
      })
      .sort((a, b) =>
        a.product.name.localeCompare(b.product.name, undefined, { sensitivity: "base" })
      );
  }, [inventory, filter, shopFilter, search, isShopStaff, isAdmin]);

  function handleCardClick(carton: CartonRecord) {
    if (warehouseLockedForStaff && carton.location === "WAREHOUSE") return;
    setSelectedCarton(carton);
    if (carton.location === "SHOP") {
      setShowActionModal(true);
      return;
    }
    setShowActionModal(true);
  }

  function handleActionSelect(type: StockActionType) {
    setShowActionModal(false);
    setSaleType(type);
  }

  function handleSaleComplete() {
    setSaleType(null);
    setSelectedCarton(null);
    loadInventory();
  }

  function handleCloseAll() {
    setShowActionModal(false);
    setSaleType(null);
    setSelectedCarton(null);
  }

  return (
    <DashboardLayout
      user={user}
      title={isShopStaff ? "Shop Stock" : "Inventory"}
      description={
        isShopStaff
          ? user.shopName
            ? `${user.shopName} · manage shop stock or transfer from warehouse`
            : "Your assigned shop inventory"
          : "View stock, sell wholesale, or transfer to shops"
      }
      action={
        isAdmin ? (
          <Button
            variant={warehouseLocked ? "primary" : "outline"}
            onClick={toggleWarehouseLock}
            loading={lockLoading}
          >
            {warehouseLocked ? (
              <>
                <Unlock className="h-4 w-4" /> Unlock Warehouse
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Lock Warehouse
              </>
            )}
          </Button>
        ) : undefined
      }
    >
      {isShopStaff && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              { key: "SHOP" as const, label: "My Shop", count: shopCount },
              { key: "WAREHOUSE" as const, label: "Warehouse", count: warehouseLockedForStaff ? 0 : warehouseCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStaffTab(tab.key)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                staffTab === tab.key
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-secondary"
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {warehouseLockedForStaff && staffTab === "WAREHOUSE" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#ddd0b8] bg-[#faf6ee] border-l-4 border-l-warning p-4 text-sm">
          <Lock className="h-5 w-5 shrink-0 text-warning mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Warehouse is locked</p>
            <p className="text-muted-foreground mt-1">
              {OWNER_NAME} has locked warehouse management. Warehouse stock is hidden until it is unlocked.
            </p>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isShopStaff ? "Search by product name..." : "Search by product name or batch..."}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isShopStaff && (
          <div className="flex flex-wrap gap-2">
            {(["ALL", "WAREHOUSE", "SHOP"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                  filter === f
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-secondary"
                )}
              >
                {f === "ALL"
                  ? `All (${warehouseCount + shopCount})`
                  : f === "WAREHOUSE"
                    ? `Warehouse (${warehouseCount})`
                    : `Shop (${shopCount})`}
              </button>
            ))}
          </div>
        )}
        </div>

        {!isShopStaff && filter === "SHOP" && shopOptions.length > 0 && (
          <div className="flex items-center gap-3">
            <label htmlFor="shop-filter" className="text-sm font-medium text-muted-foreground shrink-0">
              Shop
            </label>
            <Select
              id="shop-filter"
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              className="max-w-xs"
            >
              <option value="ALL">All shops</option>
              {shopOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!loading && isAdmin && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Warehouse stock value
            </p>
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
              {formatCurrency(stockValueTotals.warehouse)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{warehouseCount} products</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Shop stock value
            </p>
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
              {formatCurrency(stockValueTotals.shop)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{shopCount} products</p>
          </div>
        </div>
      )}

      {!loading && search && (
        <p className="mb-4 text-sm text-muted-foreground">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            warehouseLockedForStaff && staffTab === "WAREHOUSE" ? (
              <Lock className="h-8 w-8" />
            ) : search ? (
              <Search className="h-8 w-8" />
            ) : (
              <Store className="h-8 w-8" />
            )
          }
          title={
            isShopStaff && !user.shopId
              ? "No shop assigned"
              : warehouseLockedForStaff && staffTab === "WAREHOUSE"
                ? "Warehouse locked"
              : search
                ? "No products found"
                : "No inventory"
          }
          description={
            isShopStaff && !user.shopId
              ? `Ask ${OWNER_NAME} to assign you to a shop before you can view stock`
              : warehouseLockedForStaff && staffTab === "WAREHOUSE"
                ? `${OWNER_NAME} has locked the warehouse. Switch to My Shop or ask ${OWNER_NAME} to unlock it.`
              : search
                ? "Try a different product name or clear the search"
                : isShopStaff
                  ? `No products in your shop yet. Stock appears here after a transfer from ${OWNER_NAME}`
                  : "Import products to see inventory here"
          }
          action={
            search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Clear search
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {filtered.map((carton) => {
              const isWarehouse = carton.location === "WAREHOUSE";
              const isShopStock = !isWarehouse;
              const unitCost = carton.product.unitCost ? parseFloat(carton.product.unitCost) : 0;
              const transferPrice = carton.warehouseLeavingPrice
                ? parseFloat(carton.warehouseLeavingPrice)
                : null;
              const retailPrice = carton.retailUnitPrice ? parseFloat(carton.retailUnitPrice) : null;
              const displayUnitPrice = isShopStock
                ? transferPrice ?? retailPrice ?? unitCost
                : unitCost;
              const stockValue = displayUnitPrice * carton.remainingItems;
              const stockPercent =
                carton.totalCartons > 0
                  ? Math.round((carton.remainingCartons / carton.totalCartons) * 100)
                  : 0;
              const looseItems = Math.max(
                0,
                carton.remainingItems - carton.remainingCartons * carton.itemsPerCarton
              );

              return (
                <div key={carton.id} className="group w-full">
                  <button
                    type="button"
                    onClick={() => handleCardClick(carton)}
                    disabled={warehouseLockedForStaff && isWarehouse}
                    className={cn(
                      "relative w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      warehouseLockedForStaff && isWarehouse
                        ? "cursor-default border-l-4 border-l-primary border-border"
                        : "hover:shadow-md hover:shadow-primary/10",
                      isWarehouse
                        ? "border-l-4 border-l-[#6a9bb8] border-border hover:border-[#a8c4d8]"
                        : "border-l-4 border-l-primary border-border hover:border-primary/30"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute right-0 top-0 h-16 w-16 translate-x-5 -translate-y-5 rounded-full opacity-35 transition-transform duration-500 group-hover:scale-110",
                        isWarehouse ? "bg-[#ccdbe8]/60" : "bg-primary-light/70"
                      )}
                    />

                    <div className="relative p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {carton.product.name}
                          </h3>
                        </div>
                        {isWarehouse ? (
                          <Badge variant="info" className="shrink-0 text-[11px] px-2 py-0.5">
                            <span className="flex items-center gap-1">
                              <Warehouse className="h-3 w-3" /> Warehouse
                            </span>
                          </Badge>
                        ) : isAdmin && carton.shop?.name ? (
                          <Badge variant="primary" className="shrink-0 max-w-[120px] text-[11px] px-2 py-0.5">
                            <span className="flex items-center gap-1 truncate">
                              <Store className="h-3 w-3 shrink-0" />
                              <span className="truncate">{carton.shop.name}</span>
                            </span>
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mb-2 flex items-baseline justify-between rounded-lg bg-gradient-to-r from-secondary to-primary-light/50 px-2.5 py-2">
                        {!isShopStaff ? (
                          <>
                            <div>
                              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                                {isShopStock ? "Transfer price" : "Unit cost"}
                              </p>
                              <p className="text-sm font-bold text-primary-dark">
                                {formatCurrency(displayUnitPrice)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                                Stock value
                              </p>
                              <p className="text-sm font-bold text-foreground">{formatCurrency(stockValue)}</p>
                            </div>
                          </>
                        ) : (
                          <div className="w-full text-center">
                            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                              In stock
                            </p>
                            <p className="text-sm font-bold text-primary-dark">
                              {carton.remainingItems} items
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-lg border border-border/60 bg-muted/50 px-1.5 py-1.5 text-center">
                          <p className="text-base font-bold text-foreground leading-none">{carton.remainingCartons}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">Cartons</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/50 px-1.5 py-1.5 text-center">
                          <p className="text-base font-bold text-foreground leading-none">{carton.remainingItems}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">Items</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/50 px-1.5 py-1.5 text-center">
                          <p className="text-base font-bold text-foreground leading-none">{looseItems}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">Out of ctn</p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Stock level</span>
                          <span>
                            {carton.remainingCartons}/{carton.totalCartons} cartons ({stockPercent}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            style={{ width: `${stockPercent}%` }}
                            className={cn("h-full rounded-full transition-all", isWarehouse ? "bg-[#6a9bb8]" : "bg-primary")}
                          />
                        </div>
                      </div>

                      {!warehouseLockedForStaff || !isWarehouse ? (
                        warehouseLockedForStaff && isWarehouse ? null : (
                          <p className="mt-2 text-center text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                            {isShopStock ? "Click to manage stock →" : "Click to move stock →"}
                          </p>
                        )
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground"
        >
          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
          Showing {filtered.length} product{filtered.length !== 1 ? "s" : ""}
          {isShopStaff
            ? staffTab === "SHOP"
              ? " in your shop"
              : " in warehouse"
            : ` of ${warehouseCount + shopCount}`}
          {!isShopStaff && " · Click warehouse stock to sell wholesale or transfer"}
          {isShopStaff && staffTab === "SHOP" && " · Click shop stock to sell or return to warehouse"}
        </motion.div>
      )}

      <StockActionModal
        open={showActionModal}
        onClose={handleCloseAll}
        onSelect={handleActionSelect}
        product={
          selectedCarton
            ? {
                name: selectedCarton.product.name,
                unitCost: selectedCarton.product.unitCost ?? "0",
                retailUnitPrice: selectedCarton.retailUnitPrice ?? null,
                batchNumber: selectedCarton.product.import?.batchNumber,
                location: selectedCarton.location,
                remainingCartons: selectedCarton.remainingCartons,
                remainingItems: selectedCarton.remainingItems,
              }
            : null
        }
        userRole={user.role}
      />

      {saleType && selectedCarton && saleType !== "RETURN_TO_WAREHOUSE" && (
        <SaleForm
          user={user}
          type={saleType}
          mode="modal"
          initialCartonId={selectedCarton.id}
          onSuccess={handleSaleComplete}
          onCancel={handleCloseAll}
        />
      )}

      {saleType === "RETURN_TO_WAREHOUSE" && selectedCarton && (
        <ShopReturnForm
          mode="modal"
          initialCartonId={selectedCarton.id}
          initialProductName={selectedCarton.product.name}
          initialRemainingCartons={selectedCarton.remainingCartons}
          initialItemsPerCarton={selectedCarton.itemsPerCarton}
          initialWarehouseLeavingPrice={selectedCarton.warehouseLeavingPrice}
          onSuccess={handleSaleComplete}
          onCancel={handleCloseAll}
        />
      )}
    </DashboardLayout>
  );
}
