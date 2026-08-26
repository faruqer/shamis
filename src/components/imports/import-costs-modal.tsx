"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface ImportCostsModalProps {
  open: boolean;
  onClose: () => void;
  batchNumber: string;
  costs: { id?: string; name: string; amount: string | number }[];
}

export function ImportCostsModal({ open, onClose, batchNumber, costs }: ImportCostsModalProps) {
  const total = costs.reduce((sum, cost) => sum + (parseFloat(String(cost.amount)) || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import costs"
      description={`Batch ${batchNumber}`}
    >
      <div className="space-y-4 px-6 py-5">
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extra costs recorded for this import.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {costs.map((cost, index) => (
              <div key={cost.id ?? index} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{cost.name}</span>
                <span className="text-sm tabular-nums">{formatCurrency(cost.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        )}
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
