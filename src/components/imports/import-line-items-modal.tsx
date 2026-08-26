"use client";

import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

export interface ImportLineItem {
  name: string;
  amount: string | number;
}

interface ImportLineItemsModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  items: ImportLineItem[];
  onChange: (items: ImportLineItem[]) => void;
  nameSuggestions: string[];
  nameLabel?: string;
  emptyHint?: string;
}

const emptyItem = (): ImportLineItem => ({ name: "", amount: "" });

export function ImportLineItemsModal({
  open,
  onClose,
  title,
  description,
  items,
  onChange,
  nameSuggestions,
  nameLabel = "Name",
  emptyHint = "No entries yet.",
}: ImportLineItemsModalProps) {
  const datalistId = `import-line-items-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const total = items.reduce((sum, item) => sum + (parseFloat(String(item.amount)) || 0), 0);

  function updateItem(index: number, field: keyof ImportLineItem, value: string) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function addItem() {
    onChange([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="space-y-4 px-6 py-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  {index === 0 && <Label className="text-xs">{nameLabel}</Label>}
                  <Input
                    list={datalistId}
                    value={item.name}
                    onChange={(e) => updateItem(index, "name", e.target.value)}
                    placeholder="Pick existing or type new"
                  />
                </div>
                <div className="w-28 space-y-1">
                  {index === 0 && <Label className="text-xs">Amount</Label>}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.amount}
                    onChange={(e) => updateItem(index, "amount", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={index === 0 ? "mt-5" : ""}
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <datalist id={datalistId}>
          {nameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3 w-3" /> Add
            </Button>
            <Button type="button" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
