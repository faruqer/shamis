"use client";

import { cn } from "@/lib/utils";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  items: BarChartItem[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function BarChart({
  items,
  height = 220,
  formatValue = (v) => String(v),
  className,
}: BarChartProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="flex items-end gap-3 min-h-[220px] px-2" style={{ height }}>
        {items.map((item) => {
          const pct = (item.value / maxValue) * 100;
          return (
            <div key={item.label} className="flex flex-1 min-w-[56px] flex-col items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                {formatValue(item.value)}
              </span>
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-[48px] rounded-t-md transition-all duration-500"
                  style={{
                    height: `${Math.max(pct, item.value > 0 ? 4 : 0)}%`,
                    backgroundColor: item.color ?? "hsl(var(--primary))",
                  }}
                  title={`${item.label}: ${formatValue(item.value)}`}
                />
              </div>
              <span className="text-[10px] text-center text-muted-foreground line-clamp-2">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
