"use client";

import { CheckCircle2, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

function parseAmount(value: string | number | undefined) {
  return parseFloat(String(value ?? 0)) || 0;
}

function getCreditPaidAmount(record: { creditPaidAmount?: string }) {
  return parseAmount(record.creditPaidAmount);
}

function getCreditOutstanding(record: {
  creditAmount: string;
  creditPaidAmount?: string;
  creditPaid: boolean;
}) {
  const total = parseAmount(record.creditAmount);
  if (total <= 0 || record.creditPaid) return 0;
  return Math.max(0, total - getCreditPaidAmount(record));
}

function isPersonPaid(
  person: { amount: string; paidAmount?: string },
  importFullyPaid: boolean
) {
  const outstanding = Math.max(0, parseAmount(person.amount) - parseAmount(person.paidAmount));
  if (outstanding <= 0.001) return true;
  return importFullyPaid && parseAmount(person.paidAmount) === 0;
}

interface ImportCreditDetailsModalProps {
  open: boolean;
  onClose: () => void;
  importRecord: {
    batchNumber: string;
    creditAmount: string;
    creditPaidAmount?: string;
    creditPaid: boolean;
    creditPersons?: { id: string; name: string; amount: string; paidAmount?: string }[];
  };
}

export function ImportCreditDetailsModal({
  open,
  onClose,
  importRecord,
}: ImportCreditDetailsModalProps) {
  const creditAmount = parseAmount(importRecord.creditAmount);
  const creditPaidAmount = getCreditPaidAmount(importRecord);
  const outstanding = getCreditOutstanding(importRecord);
  const persons = importRecord.creditPersons ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import credit"
      description={`Batch ${importRecord.batchNumber}`}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(creditAmount)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(creditPaidAmount)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due</p>
            <p className="text-sm font-semibold tabular-nums text-warning">{formatCurrency(outstanding)}</p>
          </div>
        </div>

        {persons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit persons recorded.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {persons.map((person) => {
              const paid = isPersonPaid(person, importRecord.creditPaid);
              return (
                <div key={person.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(person.amount)} credit
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        <CheckCircle2 className="h-3 w-3" />
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                    {!paid && (
                      <p className="mt-1 text-sm font-semibold tabular-nums text-warning">
                        {formatCurrency(parseAmount(person.amount) - parseAmount(person.paidAmount))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
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
