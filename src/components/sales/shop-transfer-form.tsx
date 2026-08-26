"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";
import { parseInventoryResponse } from "@/lib/inventory-api";

interface InventoryCarton {
  id: string;
  cartonNumber: string;
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
  product: { name: string; unitCost: string };
}

interface ShopTransferFormProps {
  mode?: "page" | "modal";
  initialCartonId?: string;
  fixedShopId?: string;
  fixedShopName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ShopTransferForm({
  mode = "page",
  initialCartonId,
  fixedShopId,
  fixedShopName,
  onSuccess,
  onCancel,
}: ShopTransferFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inventory, setInventory] = useState<InventoryCarton[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [shopId, setShopId] = useState(fixedShopId ?? "");
  const [cartonId, setCartonId] = useState(initialCartonId ?? "");
  const [cartonsToTransfer, setCartonsToTransfer] = useState(1);
  const [warehouseLeavingPrice, setWarehouseLeavingPrice] = useState("");
  const [retailUnitPrice, setRetailUnitPrice] = useState("");

  const selected = inventory.find((c) => c.id === cartonId);

  useEffect(() => {
    if (fixedShopId) {
      setShopId(fixedShopId);
    } else {
      fetch("/api/shops")
        .then((r) => r.json())
        .then((data: { id: string; name: string; isActive: boolean }[]) => {
          const active = data.filter((s) => s.isActive !== false);
          setShops(active);
          if (active.length === 1) setShopId(active[0].id);
        });
    }

    fetch("/api/inventory?location=WAREHOUSE")
      .then((r) => r.json())
      .then((data) => {
        const items = parseInventoryResponse<InventoryCarton>(data);
        setInventory(items);
        if (initialCartonId) {
          const carton = items.find((c: InventoryCarton) => c.id === initialCartonId);
          if (carton) {
            applyCartonDefaults(carton, initialCartonId);
          }
        }
      });
  }, [initialCartonId, fixedShopId]);

  function applyCartonDefaults(carton: InventoryCarton, id: string) {
    setCartonId(id);
    setCartonsToTransfer(Math.min(1, carton.remainingCartons));
    setWarehouseLeavingPrice(carton.product.unitCost);
    setRetailUnitPrice(carton.product.unitCost);
  }

  function handleCartonChange(id: string) {
    setCartonId(id);
    const carton = inventory.find((c) => c.id === id);
    if (carton) applyCartonDefaults(carton, id);
  }

  const leavingPrice = parseFloat(warehouseLeavingPrice) || 0;
  const retailPrice = parseFloat(retailUnitPrice) || 0;
  const itemsTransferred = cartonsToTransfer * (selected?.itemsPerCarton ?? 0);
  const transferTotal = itemsTransferred * leavingPrice;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!cartonId) throw new Error("Select a product");
      const destinationShopId = fixedShopId ?? shopId;
      if (!destinationShopId) throw new Error("Select a shop");
      if (cartonsToTransfer < 1) throw new Error("Enter at least 1 carton");
      if (leavingPrice <= 0) throw new Error("Wholesale price is required");
      if (retailPrice <= 0) throw new Error("Retail price is required");

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SHOP_TRANSFER",
          shopId: destinationShopId,
          items: [
            {
              cartonId,
              cartonsSold: cartonsToTransfer,
              warehouseLeavingPrice: leavingPrice,
              retailUnitPrice: retailPrice,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to transfer");

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer");
    } finally {
      setLoading(false);
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">{error}</div>
      )}

      <div className="space-y-2">
        <Label>Destination Shop *</Label>
        {fixedShopId ? (
          <Input readOnly value={fixedShopName ?? "Your shop"} className="bg-muted" />
        ) : (
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            required
            className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select shop...</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {!initialCartonId && (
        <div className="space-y-2">
          <Label>Product *</Label>
          <select
            value={cartonId}
            onChange={(e) => handleCartonChange(e.target.value)}
            required
            className="flex h-10 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select warehouse product...</option>
            {inventory.map((c) => (
              <option key={c.id} value={c.id}>
                {c.product.name} — {c.remainingCartons} cartons available
              </option>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <p className="font-medium">{selected.product.name}</p>
          <p className="text-muted-foreground mt-1">
            {selected.remainingCartons} cartons · {selected.itemsPerCarton} items per carton
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Cartons to Transfer *</Label>
        <Input
          type="number"
          min={1}
          max={selected?.remainingCartons ?? undefined}
          value={cartonsToTransfer}
          onChange={(e) => setCartonsToTransfer(parseInt(e.target.value) || 0)}
          required
        />
        {selected && (
          <p className="text-xs text-muted-foreground">Max: {selected.remainingCartons} cartons</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Wholesale Price *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={warehouseLeavingPrice}
            onChange={(e) => setWarehouseLeavingPrice(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">Wholesale price per item (shop pays {OWNER_NAME})</p>
        </div>
        <div className="space-y-2">
          <Label>Retail Price *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={retailUnitPrice}
            onChange={(e) => setRetailUnitPrice(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">Selling price per item in the shop</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-primary-light p-4">
        <span className="font-semibold text-primary-dark">Transfer Total</span>
        <span className="text-xl font-bold text-primary">{formatCurrency(transferTotal)}</span>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" loading={loading} className={onCancel ? "flex-1" : "w-full"} size="lg">
          Complete Transfer
        </Button>
      </div>
    </form>
  );

  if (mode === "modal") {
    return (
      <Modal open onClose={() => onCancel?.()} title="Transfer to Shop" className="max-w-lg">
        <div className="px-6 py-4">{formContent}</div>
      </Modal>
    );
  }

  return formContent;
}
