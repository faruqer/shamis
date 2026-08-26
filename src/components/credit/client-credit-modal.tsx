"use client";



import { useEffect, useMemo, useState } from "react";

import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";

import { Modal } from "@/components/ui/modal";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";

import { PaymentMethodFields } from "@/components/sales/payment-method-fields";

import { cn, formatCurrency, formatDateTime } from "@/lib/utils";



export interface ClientCreditSaleItem {

  productName: string;

  cartonsSold: number;

  itemsSold: number;

  unitPrice: number;

  totalPrice: number;

}



export interface ClientCreditSale {

  id: string;

  clientId?: string;

  productNames: string;

  clientName: string;

  paidAmount: number;

  outstanding: number;

  paymentStatus: string;

  paymentMethod: string | null;

  saleDate: string;

  items: ClientCreditSaleItem[];

}



export interface ClientCreditHistoryEntry {

  id: string;

  category: "OWNER" | "CLIENT";

  type: string;

  amount: number;

  description: string;

  entryDate: string;

  clientId?: string;

  clientName?: string;

  productNames?: string;

  items?: ClientCreditSaleItem[];

  paymentMethod?: string | null;

  reference?: string;

}



interface ClientCreditModalProps {

  open: boolean;

  onClose: () => void;

  client: { clientId: string; clientName: string; amount: number } | null;

  creditSales: ClientCreditSale[];

  creditHistory: ClientCreditHistoryEntry[];

  onPaymentSuccess: () => void;

}



function historyTypeLabel(type: string) {

  switch (type) {

    case "CREDIT_SALE":

      return "Credit Sale";

    case "PAYMENT":

      return "Payment";

    default:

      return type.replace(/_/g, " ");

  }

}



function formatLineQuantity(cartonsSold: number, itemsSold: number) {

  if (cartonsSold > 0 && itemsSold > 0) {

    return `${cartonsSold} carton${cartonsSold !== 1 ? "s" : ""}, ${itemsSold} piece${itemsSold !== 1 ? "s" : ""}`;

  }

  if (cartonsSold > 0) {

    return `${cartonsSold} carton${cartonsSold !== 1 ? "s" : ""}`;

  }

  if (itemsSold > 0) {

    return `${itemsSold} piece${itemsSold !== 1 ? "s" : ""}`;

  }

  return "—";

}



function SaleLineItems({ items }: { items: ClientCreditSaleItem[] }) {

  if (items.length === 0) return null;



  return (

    <ul className="mt-2 space-y-1.5">

      {items.map((item, index) => (

        <li

          key={`${item.productName}-${index}`}

          className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs"

        >

          <p className="font-medium text-foreground">{item.productName}</p>

          <p className="text-muted-foreground mt-0.5">

            {formatLineQuantity(item.cartonsSold, item.itemsSold)}

            {" · "}

            {formatCurrency(item.unitPrice)} each

            {" · "}

            <span className="font-medium text-foreground">{formatCurrency(item.totalPrice)}</span>

          </p>

        </li>

      ))}

    </ul>

  );

}



export function ClientCreditModal({

  open,

  onClose,

  client,

  creditSales,

  creditHistory,

  onPaymentSuccess,

}: ClientCreditModalProps) {

  const [amount, setAmount] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("");

  const [bankAccountId, setBankAccountId] = useState("");

  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const unpaidSales = useMemo(() => {

    if (!client) return [];

    return creditSales

      .filter(

        (sale) =>

          sale.outstanding > 0 &&

          (sale.clientId === client.clientId ||

            (!sale.clientId && sale.clientName === client.clientName))

      )

      .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());

  }, [client, creditSales]);



  const clientHistory = useMemo(() => {

    if (!client) return [];

    return creditHistory

      .filter(

        (entry) =>

          entry.category === "CLIENT" &&

          (entry.clientId === client.clientId ||

            (!entry.clientId && entry.clientName === client.clientName))

      )

      .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());

  }, [client, creditHistory]);



  const totalOutstanding = unpaidSales.reduce((sum, sale) => sum + sale.outstanding, 0);



  useEffect(() => {

    if (!open || !client) return;

    setError(null);

    setNotes("");

    setPaymentMethod("");

    setBankAccountId("");

    setAmount(totalOutstanding > 0 ? String(totalOutstanding) : "");

  }, [open, client, totalOutstanding]);



  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault();

    if (!client || unpaidSales.length === 0) return;



    const paymentAmount = parseFloat(amount);

    if (!paymentAmount || paymentAmount <= 0) {

      setError("Enter a payment amount greater than 0");

      return;

    }

    if (paymentAmount > totalOutstanding + 0.001) {

      setError(`Payment cannot exceed outstanding credit of ${formatCurrency(totalOutstanding)}`);

      return;

    }

    if (!paymentMethod) {

      setError("Select a payment method");

      return;

    }

    if (paymentMethod === "BANK_TRANSFER" && !bankAccountId) {

      setError("Select a bank for bank transfer");

      return;

    }



    setSubmitting(true);

    setError(null);



    try {

      const resolvedClientId =
        unpaidSales.find((sale) => sale.clientId)?.clientId ??
        (client.clientId.startsWith("unknown-") ? undefined : client.clientId);

      const res = await fetch("/api/payments", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          clientId: resolvedClientId,

          clientName: resolvedClientId ? undefined : client.clientName,

          amount: paymentAmount,

          paymentMethod,

          bankAccountId: bankAccountId || undefined,

          notes: notes.trim() || undefined,

        }),

      });

      const body = await res.json();

      if (!res.ok) throw new Error(body.error || "Failed to record payment");



      onPaymentSuccess();

      onClose();

    } catch (err) {

      setError(err instanceof Error ? err.message : "Failed to record payment");

    } finally {

      setSubmitting(false);

    }

  }



  if (!client) return null;



  return (

    <Modal

      open={open}

      onClose={onClose}

      title={client.clientName}

      description={`Outstanding balance: ${formatCurrency(client.amount)}`}

      className="max-w-xl"

    >

      <div className="px-6 py-4 space-y-6">

        {unpaidSales.length > 0 ? (

          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">

            <h3 className="text-sm font-semibold">Receive Credit Payment</h3>

            <p className="text-xs text-muted-foreground">

              Payment is applied to the oldest unpaid sales first, then to the next sale as partial if any amount remains.

            </p>



            <div className="space-y-2">
              <Label className="text-sm">Unpaid sales ({unpaidSales.length})</Label>
              <div className="max-h-36 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
                {unpaidSales.map((sale, index) => (
                  <div key={sale.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">
                        {index === 0 ? "Oldest first" : `#${index + 1}`} · {formatDateTime(sale.saleDate)}
                      </p>
                      <p className="truncate font-medium">{sale.productNames}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-destructive tabular-nums">
                      {formatCurrency(sale.outstanding)}
                    </span>
                  </div>
                ))}
              </div>
            </div>



            <div className="space-y-2">

              <Label className="text-sm">Amount *</Label>

              <Input

                type="number"

                min="0.01"

                step="0.01"

                max={totalOutstanding}

                value={amount}

                onChange={(e) => setAmount(e.target.value)}

                placeholder="Payment amount"

                required

              />

              <p className="text-xs text-muted-foreground">

                Total due across {unpaidSales.length} sale{unpaidSales.length !== 1 ? "s" : ""}: {formatCurrency(totalOutstanding)}

              </p>

            </div>



            <PaymentMethodFields

              paymentMethod={paymentMethod}

              onPaymentMethodChange={setPaymentMethod}

              bankAccountId={bankAccountId}

              onBankAccountChange={setBankAccountId}

            />



            <div className="space-y-2">

              <Label className="text-sm">Notes</Label>

              <Input

                value={notes}

                onChange={(e) => setNotes(e.target.value)}

                placeholder="Optional note"

              />

            </div>



            {error && <p className="text-sm text-destructive">{error}</p>}



            <Button type="submit" className="w-full" disabled={submitting}>

              {submitting ? (

                <>

                  <Loader2 className="h-4 w-4 animate-spin" />

                  Recording...

                </>

              ) : (

                "Record Payment"

              )}

            </Button>

          </form>

        ) : (

          <p className="text-sm text-muted-foreground text-center py-2">

            No unpaid sales for this client.

          </p>

        )}



        <div className="space-y-3">

          <h3 className="text-sm font-semibold">Transaction History</h3>

          {clientHistory.length === 0 ? (

            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>

          ) : (

            <div className="space-y-2 max-h-80 overflow-y-auto">

              {clientHistory.map((entry) => {

                const isPayment = entry.type === "PAYMENT";

                const Icon = isPayment ? ArrowDownRight : ArrowUpRight;



                return (

                  <div

                    key={entry.id}

                    className={cn(

                      "rounded-lg px-3 py-2.5 border border-l-4",

                      isPayment

                        ? "border-[#ccdbe8] bg-[#eef4fa] border-l-[#6a9bb8]"

                        : "border-[#c8dcc8] bg-[#eef6ee] border-l-success"

                    )}

                  >

                    <div className="flex items-start justify-between gap-3">

                      <div className="min-w-0 flex-1">

                        <div className="flex flex-wrap items-center gap-2 mb-1">

                          <Badge variant={isPayment ? "info" : "warning"}>

                            {historyTypeLabel(entry.type)}

                          </Badge>

                          {isPayment && entry.paymentMethod && (

                            <span className="text-xs text-muted-foreground">{entry.paymentMethod}</span>

                          )}

                        </div>

                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.entryDate)}</p>

                        {entry.items && entry.items.length > 0 ? (

                          <SaleLineItems items={entry.items} />

                        ) : (

                          <p className="text-sm font-medium mt-1">{entry.description}</p>

                        )}

                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">

                        <Icon className={cn("h-4 w-4", isPayment ? "text-[#6a9bb8]" : "text-success")} />

                        <span

                          className={cn(

                            "font-semibold text-sm",

                            isPayment ? "text-[#2d4a62]" : "text-success"

                          )}

                        >

                          {formatCurrency(entry.amount)}

                        </span>

                      </div>

                    </div>

                  </div>

                );

              })}

            </div>

          )}

        </div>

      </div>

    </Modal>

  );

}

