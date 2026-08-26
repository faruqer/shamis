"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { getImportTotalValue } from "@/lib/import-utils";

export interface ImportCostInput {
  name: string;
  amount: string | number;
}

export interface ImportCreditPersonInput {
  name: string;
  amount: string | number;
}

export interface ProductInput {
  name: string;
  unitCost: number;
  totalCartons: number;
  itemsPerCarton: number;
}

export interface ImportFormValues {
  batchNumber: string;
  importDate: string;
  costs: ImportCostInput[];
  creditPersons?: ImportCreditPersonInput[];
  creditPaidAmount?: string | number;
  creditPaid: boolean;
  products: ProductInput[];
}

interface ImportFormProps {
  user: { name: string; role: Role; email: string };
  mode: "create" | "edit";
  importId?: string;
  initialValues?: ImportFormValues;
}

const emptyProduct = (): ProductInput => ({
  name: "",
  unitCost: 0,
  totalCartons: 1,
  itemsPerCarton: 12,
});

const emptyCost = (): ImportCostInput => ({
  name: "",
  amount: "",
});

const emptyCreditPerson = (): ImportCreditPersonInput => ({
  name: "",
  amount: "",
});

export function ImportForm({ user, mode, importId, initialValues }: ImportFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pastCostNames, setPastCostNames] = useState<string[]>([]);
  const [pastProductNames, setPastProductNames] = useState<string[]>([]);
  const [pastCreditPersonNames, setPastCreditPersonNames] = useState<string[]>([]);
  const [batchNumber, setBatchNumber] = useState(initialValues?.batchNumber ?? "");
  const [importDate, setImportDate] = useState(
    initialValues?.importDate ?? new Date().toISOString().split("T")[0]
  );
  const [costs, setCosts] = useState<ImportCostInput[]>(initialValues?.costs ?? []);
  const [creditPersons, setCreditPersons] = useState<ImportCreditPersonInput[]>(
    initialValues?.creditPersons ?? []
  );
  const creditPaidAmount = parseFloat(String(initialValues?.creditPaidAmount ?? 0)) || 0;
  const [products, setProducts] = useState<ProductInput[]>(
    initialValues?.products.length ? initialValues.products : [emptyProduct()]
  );
  const productRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focusProductIndex, setFocusProductIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/imports")
      .then((r) => r.json())
      .then((imports: {
        costs?: { name: string }[];
        products?: { name: string }[];
        creditPersons?: { name: string }[];
      }[]) => {
        const costNames = new Set<string>();
        const productNames = new Set<string>();
        const creditNames = new Set<string>();
        for (const imp of imports) {
          for (const cost of imp.costs ?? []) {
            if (cost.name.trim()) costNames.add(cost.name.trim());
          }
          for (const product of imp.products ?? []) {
            if (product.name.trim()) productNames.add(product.name.trim());
          }
          for (const person of imp.creditPersons ?? []) {
            if (person.name?.trim()) creditNames.add(person.name.trim());
          }
        }
        setPastCostNames([...costNames].sort((a, b) => a.localeCompare(b)));
        setPastProductNames([...productNames].sort((a, b) => a.localeCompare(b)));
        setPastCreditPersonNames([...creditNames].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (focusProductIndex === null) return;
    const el = productRefs.current[focusProductIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const nameInput = el.querySelector('input[data-product-name="true"]');
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus();
      }
    }
    setFocusProductIndex(null);
  }, [focusProductIndex, products.length]);

  const previewTotal = getImportTotalValue({
    costs: costs.map((c) => ({ name: c.name, amount: parseFloat(String(c.amount)) || 0 })),
    products: products.map((p) => ({
      unitCost: parseFloat(String(p.unitCost)) || 0,
      cartons: [{ totalCartons: Number(p.totalCartons) || 0, itemsPerCarton: Number(p.itemsPerCarton) || 0 }],
    })),
  });

  const costsTotal = costs.reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const creditTotal = creditPersons.reduce(
    (sum, person) => sum + (parseFloat(String(person.amount)) || 0),
    0
  );

  function addCost() {
    setCosts([...costs, emptyCost()]);
  }

  function removeCost(index: number) {
    setCosts(costs.filter((_, i) => i !== index));
  }

  function updateCost(index: number, field: keyof ImportCostInput, value: string) {
    const updated = [...costs];
    updated[index] = { ...updated[index], [field]: value };
    setCosts(updated);
  }

  function addCreditPerson() {
    setCreditPersons([...creditPersons, emptyCreditPerson()]);
  }

  function removeCreditPerson(index: number) {
    setCreditPersons(creditPersons.filter((_, i) => i !== index));
  }

  function updateCreditPerson(index: number, field: keyof ImportCreditPersonInput, value: string) {
    const updated = [...creditPersons];
    updated[index] = { ...updated[index], [field]: value };
    setCreditPersons(updated);
  }

  function addProduct() {
    const newIndex = products.length;
    setProducts([...products, emptyProduct()]);
    setFocusProductIndex(newIndex);
  }

  function removeProduct(index: number) {
    setProducts(products.filter((_, i) => i !== index));
  }

  function updateProduct(index: number, field: keyof ProductInput, value: string | number) {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    setProducts(updated);
  }

  function isFormDirty() {
    const defaultDate = new Date().toISOString().split("T")[0];
    const hasCostData = costs.some(
      (c) => c.name.trim() || parseFloat(String(c.amount)) > 0
    );
    const hasProductData = products.some(
      (p, index) =>
        p.name.trim() ||
        parseFloat(String(p.unitCost)) > 0 ||
        p.totalCartons !== 1 ||
        p.itemsPerCarton !== 12 ||
        index > 0
    );

    const hasCreditData = creditPersons.some(
      (person) => person.name.trim() || parseFloat(String(person.amount)) > 0
    );

    if (mode === "edit" && initialValues) {
      const costsChanged =
        JSON.stringify(
          costs.map((c) => ({
            name: c.name.trim(),
            amount: parseFloat(String(c.amount)) || 0,
          }))
        ) !==
        JSON.stringify(
          initialValues.costs.map((c) => ({
            name: c.name.trim(),
            amount: parseFloat(String(c.amount)) || 0,
          }))
        );
      const creditChanged =
        JSON.stringify(
          creditPersons.map((person) => ({
            name: person.name.trim(),
            amount: parseFloat(String(person.amount)) || 0,
          }))
        ) !==
        JSON.stringify(
          (initialValues.creditPersons ?? []).map((person) => ({
            name: person.name.trim(),
            amount: parseFloat(String(person.amount)) || 0,
          }))
        );
      const productsChanged =
        JSON.stringify(products) !== JSON.stringify(initialValues.products);

      return (
        batchNumber !== initialValues.batchNumber ||
        importDate !== initialValues.importDate ||
        costsChanged ||
        creditChanged ||
        productsChanged
      );
    }

    return (
      batchNumber.trim() !== "" ||
      importDate !== defaultDate ||
      hasCostData ||
      hasCreditData ||
      hasProductData
    );
  }

  function handleBack() {
    if (
      isFormDirty() &&
      !confirm("You have unsaved changes. Leave this page without saving?")
    ) {
      return;
    }
    router.push("/imports");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const parsedCreditPersons = creditPersons
      .filter((person) => person.name.trim() && parseFloat(String(person.amount)) > 0)
      .map((person) => ({
        name: person.name.trim(),
        amount: parseFloat(String(person.amount)),
      }));

    if (parsedCreditPersons.length > 0) {
      const names = parsedCreditPersons.map((person) => person.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) {
        setError("Each person can only appear once in import credit");
        setLoading(false);
        return;
      }
    }

    const creditTotalAmount = parsedCreditPersons.reduce((sum, person) => sum + person.amount, 0);

    if (mode === "edit" && creditPaidAmount > creditTotalAmount + 0.001) {
      setError(
        `Credit total cannot be less than the amount already paid (${formatCurrency(creditPaidAmount)})`
      );
      setLoading(false);
      return;
    }

    const payload = {
      batchNumber,
      importDate,
      costs: costs
        .filter((c) => c.name.trim() && parseFloat(String(c.amount)) > 0)
        .map((c) => ({
          name: c.name.trim(),
          amount: parseFloat(String(c.amount)),
        })),
      creditPersons: parsedCreditPersons.length > 0 ? parsedCreditPersons : undefined,
      products: products.map((p) => ({
        name: p.name,
        unitCost: parseFloat(String(p.unitCost)),
        totalCartons: parseInt(String(p.totalCartons)),
        itemsPerCarton: parseInt(String(p.itemsPerCarton)),
      })),
    };

    try {
      const url = mode === "edit" && importId ? `/api/imports/${importId}` : "/api/imports";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${mode} import`);

      router.push("/imports");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode} import`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout
      user={user}
      title={mode === "edit" ? "Edit Import" : "New Import"}
      description={mode === "edit" ? "Update batch details" : "Record a new import batch"}
      action={
        <Button type="button" variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="max-w-5xl">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* Batch */}
          <section className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Batch</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Batch number *</Label>
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="CN-2026-001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Import date</Label>
                <Input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Total value</Label>
                <Input readOnly value={formatCurrency(previewTotal)} className="bg-muted font-semibold" />
              </div>
            </div>
          </section>

          {/* Costs & credit */}
          <section className="border-b border-border px-5 py-4">
            <div className="grid gap-6 md:grid-cols-2 md:gap-0">
              <div className="md:pr-5 md:border-r md:border-border">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Extra costs</h2>
                  <div className="flex items-center gap-2">
                    {costsTotal > 0 && (
                      <span className="text-xs font-medium text-primary">{formatCurrency(costsTotal)}</span>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={addCost}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                </div>
                {costs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No shipping, customs, or handling costs added.</p>
                ) : (
                  <div className="space-y-2">
                    {costs.map((cost, cIndex) => (
                      <div key={cIndex} className="flex items-center gap-2">
                        <Input
                          list="import-cost-names"
                          value={cost.name}
                          onChange={(e) => updateCost(cIndex, "name", e.target.value)}
                          placeholder="Pick existing or type new"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cost.amount}
                          onChange={(e) => updateCost(cIndex, "amount", e.target.value)}
                          placeholder="0.00"
                          className="w-28"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCost(cIndex)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:pl-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Credit</h2>
                  <div className="flex items-center gap-2">
                    {creditTotal > 0 && (
                      <span className="text-xs font-medium text-primary">{formatCurrency(creditTotal)}</span>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={addCreditPerson}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                </div>
                {mode === "edit" && creditPaidAmount > 0 && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Paid so far:{" "}
                    <span className="font-medium text-foreground">{formatCurrency(creditPaidAmount)}</span>
                  </p>
                )}
                {creditPersons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No credit entries added.</p>
                ) : (
                  <div className="space-y-2">
                    {creditPersons.map((person, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          list="import-credit-person-names"
                          value={person.name}
                          onChange={(e) => updateCreditPerson(index, "name", e.target.value)}
                          placeholder="Pick existing or type new"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={person.amount}
                          onChange={(e) => updateCreditPerson(index, "amount", e.target.value)}
                          placeholder="0.00"
                          className="w-28"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCreditPerson(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <datalist id="import-cost-names">
              {pastCostNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="import-credit-person-names">
              {pastCreditPersonNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </section>

          {/* Products */}
          <section className="border-b border-border px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Products</h2>
              <Button type="button" variant="outline" size="sm" onClick={addProduct}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground">No products added yet.</p>
            ) : (
              <div className="space-y-2">
                <div className="hidden gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                  <span className="min-w-0 flex-1">Product</span>
                  <span className="w-24 shrink-0">Unit cost</span>
                  <span className="w-20 shrink-0">Cartons</span>
                  <span className="w-20 shrink-0">Items/ctn</span>
                  <span className="w-14 shrink-0 text-right">Items</span>
                  <span className="w-20 shrink-0 text-right">Value</span>
                  <span className="w-10 shrink-0" />
                </div>
                {products.map((product, pIndex) => {
                  const totalItems =
                    (Number(product.totalCartons) || 0) * (Number(product.itemsPerCarton) || 0);
                  const lineValue =
                    (parseFloat(String(product.unitCost)) || 0) * totalItems;

                  return (
                    <div
                      key={pIndex}
                      ref={(el) => { productRefs.current[pIndex] = el; }}
                      className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
                    >
                      <Input
                        data-product-name="true"
                        list="import-product-names"
                        value={product.name}
                        onChange={(e) => updateProduct(pIndex, "name", e.target.value)}
                        placeholder="Product name"
                        required
                        className="min-w-0 flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={product.unitCost}
                        onChange={(e) => updateProduct(pIndex, "unitCost", e.target.value)}
                        placeholder="Unit cost"
                        required
                        className="w-full sm:w-24"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={product.totalCartons}
                        onChange={(e) => updateProduct(pIndex, "totalCartons", e.target.value)}
                        placeholder="Ctns"
                        required
                        className="w-full sm:w-20"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={product.itemsPerCarton}
                        onChange={(e) => updateProduct(pIndex, "itemsPerCarton", e.target.value)}
                        placeholder="/ctn"
                        required
                        className="w-full sm:w-20"
                      />
                      <span className="w-full text-right text-xs tabular-nums text-muted-foreground sm:w-14">
                        {totalItems || "—"}
                      </span>
                      <span className="w-full text-right text-sm font-medium tabular-nums sm:w-20">
                        {lineValue > 0 ? formatCurrency(lineValue) : "—"}
                      </span>
                      {products.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => removeProduct(pIndex)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <span className="hidden w-10 shrink-0 sm:block" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <datalist id="import-product-names">
              {pastProductNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </section>

          <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/30 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-bold text-foreground">{formatCurrency(previewTotal)}</span>
            </p>
            <Button type="submit" loading={loading}>
              {mode === "edit" ? "Save Changes" : "Create Batch"}
            </Button>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
