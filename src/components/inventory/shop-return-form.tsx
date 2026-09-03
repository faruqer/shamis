"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";

interface ShopReturnFormProps {
  mode?: "page" | "modal";
  initialCartonId?: string;
  initialProductName?: string;
  initialRemainingCartons?: number;
  initialItemsPerCarton?: number;
  initialWarehouseLeavingPrice?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ShopReturnForm({
  mode = "modal",
  initialCartonId,
  initialProductName,
  initialRemainingCartons = 1,
  initialItemsPerCarton = 1,
  initialWarehouseLeavingPrice,
  onSuccess,
  onCancel,
}: ShopReturnFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cartonsToReturn, setCartonsToReturn] = useState(1);

  useEffect(() => {
    setCartonsToReturn(Math.min(1, initialRemainingCartons));
  }, [initialCartonId, initialRemainingCartons]);

  const wholesaleUnit = initialWarehouseLeavingPrice
    ? parseFloat(initialWarehouseLeavingPrice)
    : 0;
  const itemsReturned = cartonsToReturn * initialItemsPerCarton;
  const returnTotal = itemsReturned * wholesaleUnit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!initialCartonId) throw new Error("No product selected");
      if (cartonsToReturn < 1) throw new Error("Enter at least 1 carton");
      if (cartonsToReturn > initialRemainingCartons) {
        throw new Error(`Maximum ${initialRemainingCartons} cartons available`);
      }

      const res = await fetch("/api/inventory/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartonId: initialCartonId,
          cartonsToReturn,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to return stock");

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to return stock");
    } finally {
      setLoading(false);
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">
          {error}
        </div>
      )}

      {initialProductName && (
        <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <p className="font-medium">{initialProductName}</p>
          <p className="text-muted-foreground mt-1">
            {initialRemainingCartons} cartons · {initialItemsPerCarton} items per carton
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Cartons to Return *</Label>
        <Input
          type="number"
          min={1}
          max={initialRemainingCartons}
          value={cartonsToReturn}
          onChange={(e) => setCartonsToReturn(parseInt(e.target.value) || 0)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Max: {initialRemainingCartons} cartons · stock goes back to the warehouse
        </p>
      </div>

      {wholesaleUnit > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-secondary p-4">
          <span className="text-sm text-muted-foreground">
            Credit reversed ({OWNER_NAME})
          </span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(returnTotal)}</span>
        </div>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" loading={loading} className={onCancel ? "flex-1" : "w-full"} size="lg">
          Return to Warehouse
        </Button>
      </div>
    </form>
  );

  if (mode === "modal") {
    return (
      <Modal
        open
        onClose={() => onCancel?.()}
        title="Return to Warehouse"
        description="Send stock back to the warehouse if it was transferred by mistake"
        className="max-w-lg"
      >
        <div className="px-6 py-4">{formContent}</div>
      </Modal>
    );
  }

  return formContent;
}
