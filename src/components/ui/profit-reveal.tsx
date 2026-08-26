"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const PROFIT_MASK = "******";

export function ProfitEyeToggle({
  visible,
  onToggle,
  className,
}: {
  visible: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      aria-label={visible ? "Hide profit" : "Show profit"}
    >
      {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}

export function useProfitReveal(defaultVisible = false) {
  const [visible, setVisible] = useState(defaultVisible);
  return {
    visible,
    toggle: () => setVisible((current) => !current),
    mask: PROFIT_MASK,
  };
}

export function SensitiveProfitText({
  value,
  className,
  defaultVisible = false,
}: {
  value: string;
  className?: string;
  defaultVisible?: boolean;
}) {
  const { visible, toggle, mask } = useProfitReveal(defaultVisible);

  return (
    <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
      <span className="truncate">{visible ? value : mask}</span>
      <ProfitEyeToggle visible={visible} onToggle={toggle} />
    </span>
  );
}
