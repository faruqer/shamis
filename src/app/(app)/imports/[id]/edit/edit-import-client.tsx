"use client";

import { useEffect, useState } from "react";
import { ImportForm, ImportFormValues } from "@/components/imports/import-form";
import { Role } from "@prisma/client";
import { LoadingSpinner } from "@/components/layout/page-transition";

export function EditImportClient({
  user,
  importId,
}: {
  user: { name: string; role: Role; email: string };
  importId: string;
}) {
  const [initialValues, setInitialValues] = useState<ImportFormValues | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/imports/${importId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load import");
        setInitialValues({
          batchNumber: data.batchNumber,
          importDate: new Date(data.importDate).toISOString().split("T")[0],
          costs: data.costs?.length
            ? data.costs.map((cost: { name: string; amount: string }) => ({
                name: cost.name,
                amount: parseFloat(cost.amount) || 0,
              }))
            : parseFloat(data.customCost) > 0
              ? [{ name: "Other", amount: parseFloat(data.customCost) }]
              : [],
          creditPaidAmount: parseFloat(data.creditPaidAmount) || 0,
          creditPaid: Boolean(data.creditPaid),
          creditPersons: data.creditPersons?.length
            ? data.creditPersons.map((person: { name: string; amount: string }) => ({
                name: person.name,
                amount: parseFloat(person.amount) || 0,
              }))
            : [],
          products: data.products.map((product: {
            name: string;
            unitCost: string;
            cartons: { totalCartons: number; itemsPerCarton: number }[];
          }) => {
            const carton = product.cartons[0];
            return {
              name: product.name,
              unitCost: parseFloat(product.unitCost),
              totalCartons: carton?.totalCartons ?? 1,
              itemsPerCarton: carton?.itemsPerCarton ?? 12,
            };
          }),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load import"))
      .finally(() => setLoading(false));
  }, [importId]);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!initialValues) return null;

  return <ImportForm user={user} mode="edit" importId={importId} initialValues={initialValues} />;
}
