"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, User, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Role } from "@prisma/client";
import { cn, formatCurrency } from "@/lib/utils";
import { parseInventoryResponse } from "@/lib/inventory-api";
import { PaymentMethodFields } from "@/components/sales/payment-method-fields";

interface InventoryCarton {
  id: string;
  cartonNumber: string;
  itemsPerCarton: number;
  remainingCartons: number;
  remainingItems: number;
  product: { name: string; unitCost: string };
}

interface SaleItemInput {
  cartonId: string;
  cartonsSold: number;
  unitPrice: number;
}

type PaymentOption = "PAID" | "CREDIT" | "PARTIAL";

const PAYMENT_OPTIONS: { value: PaymentOption; label: string; description: string }[] = [
  { value: "PAID", label: "Paid", description: "Full amount received" },
  { value: "CREDIT", label: "Credit", description: "Nothing paid now" },
  { value: "PARTIAL", label: "Partial", description: "Part paid, rest on credit" },
];

interface WholesaleSaleFormProps {
  user: { id: string; name: string; role: Role; email: string };
  mode?: "page" | "modal";
  initialCartonId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function buildWholesaleItem(carton: InventoryCarton, cartonId: string): SaleItemInput {
  return {
    cartonId,
    cartonsSold: 1,
    unitPrice: parseFloat(carton.product.unitCost),
  };
}

function lineTotal(item: SaleItemInput, carton?: InventoryCarton) {
  if (!carton) return 0;
  return item.cartonsSold * carton.itemsPerCarton * item.unitPrice;
}

export function WholesaleSaleForm({
  user,
  mode = "page",
  initialCartonId,
  onSuccess,
  onCancel,
}: WholesaleSaleFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inventory, setInventory] = useState<InventoryCarton[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientInput, setClientInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("CREDIT");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [items, setItems] = useState<SaleItemInput[]>([
    { cartonId: initialCartonId ?? "", cartonsSold: 1, unitPrice: 0 },
  ]);

  useEffect(() => {
    fetch("/api/inventory?location=WAREHOUSE")
      .then((r) => r.json())
      .then((data) => {
        const inventoryItems = parseInventoryResponse<InventoryCarton>(data);
        setInventory(inventoryItems);
        if (initialCartonId) {
          const carton = inventoryItems.find((c) => c.id === initialCartonId);
          if (carton) {
            setItems([buildWholesaleItem(carton, initialCartonId)]);
          }
        }
      });

    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, [initialCartonId]);

  function handleClientChange(value: string) {
    setClientInput(value);
    const match = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    setClientId(match?.id ?? "");
  }

  function addItem() {
    setItems([...items, { cartonId: "", cartonsSold: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    if (initialCartonId && items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof SaleItemInput, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "cartonId" && typeof value === "string") {
      const carton = inventory.find((c) => c.id === value);
      if (carton) {
        updated[index] = buildWholesaleItem(carton, value);
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

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WHOLESALE",
          clientId: clientId || undefined,
          clientName: !clientId ? clientInput.trim() : undefined,
          paymentOption,
          paidAmount: paymentOption === "PARTIAL" ? parseFloat(paidAmount) || 0 : undefined,
          paymentMethod: showPaymentMethod ? paymentMethod : undefined,
          bankAccountId:
            showPaymentMethod && paymentMethod === "BANK_TRANSFER" ? bankAccountId : undefined,
          items: items.map((item) => ({
            cartonId: item.cartonId,
            cartonsSold: item.cartonsSold,
            itemsSold: 0,
            unitPrice: item.unitPrice,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create sale");

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sale");
    } finally {
      setLoading(false);
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">{error}</div>
      )}

      <Card className="overflow-hidden border-border/80">
        <CardHeader className="border-b border-border/60 bg-surface/50 pb-4">
          <CardTitle className="text-base font-semibold">Sale Details</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Client and payment information</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-border/60">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Client
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Client *</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    list="wholesale-clients"
                    value={clientInput}
                    onChange={(e) => handleClientChange(e.target.value)}
                    placeholder="New name or pick existing"
                    className="pl-9"
                    required
                  />
                  <datalist id="wholesale-clients">
                    {clients.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                {clientId ? (
                  <p className="text-xs text-primary">Existing client selected</p>
                ) : clientInput.trim() ? (
                  <p className="text-xs text-muted-foreground">New client will be created</p>
                ) : null}
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
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">
                        {option.description}
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
                      {totalAmount > 0 && parseFloat(paidAmount) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Remaining on credit: {formatCurrency(totalAmount - (parseFloat(paidAmount) || 0))}
                        </p>
                      )}
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

              {paymentOption === "PAID" && totalAmount > 0 && (
                <div className="rounded-lg bg-primary/8 border border-primary/15 px-3 py-2 text-xs text-primary-dark">
                  Collecting {formatCurrency(totalAmount)} in full
                </div>
              )}

              {paymentOption === "CREDIT" && (
                <div className="rounded-lg bg-muted/60 border border-border px-3 py-2 text-xs text-muted-foreground">
                  No payment collected — full amount on credit
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          {!initialCartonId && (
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3 w-3" /> Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const carton = inventory.find((c) => c.id === item.cartonId);
            const total = lineTotal(item, carton);

            return (
              <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Item {index + 1}</span>
                  {items.length > 1 && !initialCartonId && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {!initialCartonId && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Product</Label>
                      <Select
                        value={item.cartonId}
                        onChange={(e) => updateItem(index, "cartonId", e.target.value)}
                        required
                      >
                        <option value="">Select inventory...</option>
                        {inventory.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.product.name} — {c.remainingCartons} cartons ({c.itemsPerCarton} items/carton)
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {initialCartonId && item.cartonId && carton && (
                    <div className="md:col-span-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      {carton.product.name} · {carton.itemsPerCarton} items per carton
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Cartons</Label>
                    <Input
                      type="number"
                      min="1"
                      max={carton?.remainingCartons}
                      value={item.cartonsSold}
                      onChange={(e) => updateItem(index, "cartonsSold", parseInt(e.target.value) || 0)}
                      required
                    />
                    {carton && (
                      <p className="text-xs text-muted-foreground">Max: {carton.remainingCartons} cartons</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Price per Item</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value))}
                      required
                    />
                    {carton && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatCurrency(item.unitPrice)}/item × {carton.itemsPerCarton} = {formatCurrency(item.unitPrice * carton.itemsPerCarton)}/carton
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Line Total</Label>
                    <Input readOnly value={formatCurrency(total)} className="bg-muted" />
                  </div>
                </div>
              </div>
            );
          })}
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
          Complete Sale
        </Button>
      </div>
    </form>
  );

  if (mode === "modal") {
    return (
      <Modal open onClose={() => onCancel?.()} title="Wholesale Sale" className="max-w-2xl">
        <div className="px-6 py-4">{formContent}</div>
      </Modal>
    );
  }

  return formContent;
}
