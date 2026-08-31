"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, User, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { cn, formatCurrency } from "@/lib/utils";
import { PaymentMethodFields } from "@/components/sales/payment-method-fields";
import { parseInventoryResponse } from "@/lib/inventory-api";

interface InventoryCarton {
  id: string;
  cartonNumber: string;
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
  retailUnitPrice?: string | null;
  product: { name: string; unitCost?: string };
}

interface RetailItemInput {
  cartonId: string;
  cartonsSold: string;
  itemsSold: string;
  unitPrice: string;
}

function parseItemField(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemNumbers(item: RetailItemInput) {
  return {
    cartonsSold: parseItemField(item.cartonsSold),
    itemsSold: parseItemField(item.itemsSold),
    unitPrice: parseItemField(item.unitPrice),
  };
}

type PaymentOption = "PAID" | "CREDIT" | "PARTIAL";

const PAYMENT_OPTIONS: { value: PaymentOption; label: string; description: string }[] = [
  { value: "PAID", label: "Paid", description: "Full amount received" },
  { value: "CREDIT", label: "Credit", description: "Nothing paid now" },
  { value: "PARTIAL", label: "Partial", description: "Part paid, rest on credit" },
];

interface RetailSaleFormProps {
  user: { id: string; name: string; email: string };
  mode?: "page" | "modal";
  initialCartonId?: string;
  saleId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function getRetailUnitPrice(carton: InventoryCarton) {
  if (carton.retailUnitPrice) return parseFloat(carton.retailUnitPrice);
  if (carton.product.unitCost) return parseFloat(carton.product.unitCost);
  return 0;
}

function buildRetailItem(carton: InventoryCarton, cartonId: string): RetailItemInput {
  const unitPrice = getRetailUnitPrice(carton);
  return {
    cartonId,
    cartonsSold: carton.remainingCartons > 0 ? "1" : "",
    itemsSold: "",
    unitPrice: unitPrice > 0 ? String(unitPrice) : "",
  };
}

function itemQuantity(item: RetailItemInput, carton?: InventoryCarton) {
  if (!carton) return 0;
  const { cartonsSold, itemsSold } = itemNumbers(item);
  return cartonsSold * carton.itemsPerCarton + itemsSold;
}

function lineTotal(item: RetailItemInput, carton?: InventoryCarton) {
  const { unitPrice } = itemNumbers(item);
  return itemQuantity(item, carton) * unitPrice;
}

function maxLooseItems(carton: InventoryCarton, cartonsSold: number) {
  return Math.max(0, carton.remainingItems - cartonsSold * carton.itemsPerCarton);
}

function stockLooseItems(carton: InventoryCarton) {
  return Math.max(0, carton.remainingItems - carton.remainingCartons * carton.itemsPerCarton);
}

function ProductStockBanner({ carton }: { carton: InventoryCarton }) {
  const loose = stockLooseItems(carton);

  return (
    <div className="md:col-span-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
      <p className="font-medium text-foreground truncate">{carton.product.name}</p>
      <p className="text-muted-foreground mt-0.5">
        {carton.remainingCartons} cartons · {loose} out of ctn · {carton.itemsPerCarton}/ctn
      </p>
    </div>
  );
}

export function RetailSaleForm({
  user,
  mode = "page",
  initialCartonId,
  saleId,
  onSuccess,
  onCancel,
}: RetailSaleFormProps) {
  const [loading, setLoading] = useState(false);
  const [loadingSale, setLoadingSale] = useState(Boolean(saleId));
  const [error, setError] = useState("");
  const [inventory, setInventory] = useState<InventoryCarton[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientInput, setClientInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("PAID");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<RetailItemInput[]>([
    { cartonId: initialCartonId ?? "", cartonsSold: "", itemsSold: "", unitPrice: "" },
  ]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusItemIndex === null) return;
    const el = itemRefs.current[focusItemIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const select = el.querySelector("select");
      if (select instanceof HTMLSelectElement) {
        select.focus();
      }
    }
    setFocusItemIndex(null);
  }, [focusItemIndex, items.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadFormData() {
      const [inventoryRes, clientsRes] = await Promise.all([
        fetch("/api/inventory?location=SHOP"),
        fetch("/api/clients"),
      ]);
      const inventoryData = parseInventoryResponse<InventoryCarton>(await inventoryRes.json());
      const clientsData = await clientsRes.json();
      if (cancelled) return;

      setClients(clientsData);

      if (saleId) {
        setLoadingSale(true);
        const saleRes = await fetch(`/api/sales/${saleId}`);
        const sale = await saleRes.json();
        if (cancelled) return;
        if (!saleRes.ok) {
          setError(sale.error || "Failed to load sale");
          setLoadingSale(false);
          return;
        }

        const adjustedInventory = inventoryData.map((carton) => {
          const saleItem = sale.items.find(
            (item: { cartonId: string }) => item.cartonId === carton.id
          );
          if (!saleItem) return carton;
          const cartonsSold = saleItem.cartonsSold || 0;
          const itemsSold = saleItem.itemsSold || 0;
          const restoredItems = cartonsSold * carton.itemsPerCarton + itemsSold;
          return {
            ...carton,
            remainingCartons: carton.remainingCartons + cartonsSold,
            remainingItems: carton.remainingItems + restoredItems,
          };
        });

        setInventory(adjustedInventory);
        setClientInput(sale.client?.name ?? "");
        setClientId(sale.clientId ?? "");
        setSaleDate(
          sale.saleDate
            ? new Date(sale.saleDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0]
        );
        setPaymentOption(sale.paymentStatus as PaymentOption);
        setPaidAmount(
          sale.paymentStatus === "PARTIAL" ? String(parseFloat(sale.paidAmount) || "") : ""
        );
        const firstPayment = sale.payments?.[0];
        setPaymentMethod(firstPayment?.paymentMethod ?? "");
        setBankAccountId(firstPayment?.bankAccountId ?? firstPayment?.bankAccount?.id ?? "");
        setItems(
          sale.items.map(
            (item: {
              cartonId: string;
              cartonsSold: number;
              itemsSold: number;
              unitPrice: string;
            }) => ({
              cartonId: item.cartonId,
              cartonsSold: item.cartonsSold > 0 ? String(item.cartonsSold) : "",
              itemsSold: item.itemsSold > 0 ? String(item.itemsSold) : "",
              unitPrice: String(parseFloat(item.unitPrice) || ""),
            })
          )
        );
        setLoadingSale(false);
        return;
      }

      setInventory(inventoryData);
      if (initialCartonId) {
        const carton = inventoryData.find((c) => c.id === initialCartonId);
        if (carton) {
          setItems([buildRetailItem(carton, initialCartonId)]);
        }
      }
    }

    loadFormData().catch(() => {
      if (!cancelled) setError("Failed to load sale form");
    });

    return () => {
      cancelled = true;
    };
  }, [initialCartonId, saleId]);

  function handleClientChange(value: string) {
    setClientInput(value);
    const match = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    setClientId(match?.id ?? "");
  }

  function addItem() {
    const newIndex = items.length;
    setItems([...items, { cartonId: "", cartonsSold: "", itemsSold: "", unitPrice: "" }]);
    setFocusItemIndex(newIndex);
  }

  function removeItem(index: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function getAvailableInventory(currentIndex: number) {
    const usedIds = new Set(
      items
        .map((item, i) => (i !== currentIndex ? item.cartonId : ""))
        .filter(Boolean)
    );
    return inventory.filter((c) => !usedIds.has(c.id));
  }

  function updateItem(index: number, field: keyof RetailItemInput, value: string) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "cartonId") {
      const carton = inventory.find((c) => c.id === value);
      if (carton) {
        updated[index] = buildRetailItem(carton, value);
      }
    }

    if (field === "cartonsSold") {
      const carton = inventory.find((c) => c.id === updated[index].cartonId);
      if (carton) {
        const cartonsSold = parseItemField(value);
        const maxLoose = maxLooseItems(carton, cartonsSold);
        const itemsSold = parseItemField(updated[index].itemsSold);
        if (itemsSold > maxLoose) {
          updated[index].itemsSold = maxLoose > 0 ? String(maxLoose) : "";
        }
      }
    }

    setItems(updated);
  }

  const totalAmount = items.reduce((sum, item) => {
    const carton = inventory.find((c) => c.id === item.cartonId);
    return sum + lineTotal(item, carton);
  }, 0);

  const showPaymentMethod =
    paymentOption === "PAID" || (paymentOption === "PARTIAL" && parseFloat(paidAmount) > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!clientInput.trim()) throw new Error("Client name is required");

      const cartonIds = items.map((item) => item.cartonId).filter(Boolean);
      if (new Set(cartonIds).size !== cartonIds.length) {
        throw new Error("Each product can only appear once in the same sale");
      }

      for (const item of items) {
        const carton = inventory.find((c) => c.id === item.cartonId);
        if (!carton) throw new Error("Select a product for each line");
        const { cartonsSold, itemsSold, unitPrice } = itemNumbers(item);
        const qty = cartonsSold * carton.itemsPerCarton + itemsSold;
        if (qty <= 0) throw new Error("Each line needs at least 1 carton or 1 item");
        if (unitPrice <= 0) throw new Error("Enter a price per item for each line");
        if (cartonsSold > carton.remainingCartons) {
          throw new Error(`Not enough cartons for ${carton.product.name}`);
        }
        if (qty > carton.remainingItems) {
          throw new Error(`Not enough stock for ${carton.product.name}`);
        }
      }

      if (paymentOption === "PARTIAL") {
        const paid = parseFloat(paidAmount) || 0;
        if (paid <= 0 || paid >= totalAmount) {
          throw new Error("Enter an amount greater than 0 and less than the total for partial payment");
        }
      }
      if (showPaymentMethod && !paymentMethod) {
        throw new Error("Payment method is required");
      }
      if (showPaymentMethod && paymentMethod === "BANK_TRANSFER" && !bankAccountId) {
        throw new Error("Select a bank for bank transfer");
      }

      const payload = {
        clientId: clientId || undefined,
        clientName: !clientId ? clientInput.trim() : undefined,
        saleDate,
        paymentOption,
        paidAmount: paymentOption === "PARTIAL" ? parseFloat(paidAmount) || 0 : undefined,
        paymentMethod: showPaymentMethod ? paymentMethod : undefined,
        bankAccountId:
          showPaymentMethod && paymentMethod === "BANK_TRANSFER" ? bankAccountId : undefined,
        items: items.map((item) => {
          const { cartonsSold, itemsSold, unitPrice } = itemNumbers(item);
          return {
            cartonId: item.cartonId,
            cartonsSold,
            itemsSold,
            unitPrice,
          };
        }),
      };

      const res = await fetch(saleId ? `/api/sales/${saleId}` : "/api/sales", {
        method: saleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleId ? payload : { type: "RETAIL", ...payload }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${saleId ? "update" : "create"} sale`);

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${saleId ? "update" : "create"} sale`);
    } finally {
      setLoading(false);
    }
  }

  if (loadingSale) {
    const loadingContent = (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading sale...
      </div>
    );
    if (mode === "modal") {
      return (
        <Modal open onClose={() => onCancel?.()} title="Edit Retail Sale" className="max-w-2xl">
          <div className="px-6 py-4">{loadingContent}</div>
        </Modal>
      );
    }
    return loadingContent;
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">{error}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Items</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add all products for this customer before completing the sale.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3 w-3" /> Add Product
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const carton = inventory.find((c) => c.id === item.cartonId);
            const total = lineTotal(item, carton);
            const looseMax = carton ? maxLooseItems(carton, itemNumbers(item).cartonsSold) : 0;
            const isLockedFirstItem =
              Boolean(initialCartonId && index === 0 && item.cartonId === initialCartonId);

            return (
              <div
                key={index}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={cn(
                  "rounded-lg border border-border p-4 space-y-3 transition-shadow",
                  focusItemIndex === index && "ring-2 ring-primary/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Item {index + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {isLockedFirstItem && carton ? (
                    <ProductStockBanner carton={carton} />
                  ) : (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Product</Label>
                      <Select
                        value={item.cartonId}
                        onChange={(e) => updateItem(index, "cartonId", e.target.value)}
                        required
                      >
                        <option value="">Select product...</option>
                        {getAvailableInventory(index).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.product.name} — {c.remainingCartons} cartons, {c.remainingItems} items
                          </option>
                        ))}
                      </Select>
                      {item.cartonId && carton && <ProductStockBanner carton={carton} />}
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Full Cartons</Label>
                    <Input
                      type="number"
                      min={0}
                      max={carton?.remainingCartons}
                      value={item.cartonsSold}
                      onChange={(e) => updateItem(index, "cartonsSold", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Extra Items</Label>
                    <Input
                      type="number"
                      min={0}
                      max={looseMax}
                      value={item.itemsSold}
                      onChange={(e) => updateItem(index, "itemsSold", e.target.value)}
                      placeholder="0"
                    />
                    {carton && (
                      <p className="text-[10px] text-muted-foreground">
                        Loose items (max {looseMax}) · selling {itemQuantity(item, carton)} items
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Price per Item</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Line Total</Label>
                    <Input readOnly value={formatCurrency(total)} className="bg-muted" />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80">
        <CardHeader className="border-b border-border/60 bg-surface/50 pb-4">
          <CardTitle className="text-base font-semibold">Sale Details</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Sold by {user.name}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-border/60">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Client
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Sale date</Label>
                <Input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Client *</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    list="retail-clients"
                    value={clientInput}
                    onChange={(e) => handleClientChange(e.target.value)}
                    placeholder="New name or pick existing"
                    className="pl-9"
                    required
                  />
                  <datalist id="retail-clients">
                    {clients.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 bg-muted/20">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <CircleDollarSign className="h-3.5 w-3.5" />
                Payment
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Status *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentOption(option.value)}
                      className={cn(
                        "rounded-xl border px-2 py-2.5 text-left transition-all",
                        paymentOption === option.value
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                          : "border-border bg-surface hover:border-primary/30 hover:bg-secondary/40"
                      )}
                    >
                      <p className={cn(
                        "text-xs font-semibold",
                        paymentOption === option.value ? "text-primary-dark" : "text-foreground"
                      )}>
                        {option.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {(paymentOption === "PARTIAL" || showPaymentMethod) && (
                <div className="rounded-xl border border-border/70 bg-surface/80 p-4 space-y-4">
                  {paymentOption === "PARTIAL" && (
                    <div className="space-y-2">
                      <Label className="text-sm">Amount Paid Now *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={totalAmount > 0 ? totalAmount - 0.01 : undefined}
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder={`Max ${formatCurrency(totalAmount)}`}
                        required
                      />
                    </div>
                  )}

                  {showPaymentMethod && (
                    <PaymentMethodFields
                      paymentMethod={paymentMethod}
                      onPaymentMethodChange={setPaymentMethod}
                      bankAccountId={bankAccountId}
                      onBankAccountChange={setBankAccountId}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl bg-primary-light p-4">
        <span className="font-semibold text-primary-dark">Total Amount</span>
        <span className="text-xl font-bold text-primary">{formatCurrency(totalAmount)}</span>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" loading={loading} className={onCancel ? "flex-1" : "w-full"} size="lg">
          {saleId ? "Save Changes" : "Complete Sale"}
        </Button>
      </div>
    </form>
  );

  if (mode === "modal") {
    return (
      <Modal
        open
        onClose={() => onCancel?.()}
        title={saleId ? "Edit Retail Sale" : "Retail Sale"}
        className="max-w-2xl"
      >
        <div className="px-6 py-4">{formContent}</div>
      </Modal>
    );
  }

  return formContent;
}
