"use client";

import { cn } from "@/lib/utils";

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  items: DonutChartItem[];
  size?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function DonutChart({
  items,
  size = 160,
  formatValue = (v) => String(v),
  className,
}: DonutChartProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="flex flex-col items-center gap-4">
        <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0 -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth="12" />
          {items.map((item) => {
            const segment = (item.value / total) * circumference;
            const circle = (
              <circle
                key={item.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="12"
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += segment;
            return circle;
          })}
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-[9px] font-bold rotate-90 origin-center"
            transform="rotate(90 50 50)"
          >
            {formatValue(total)}
          </text>
        </svg>

        <div className="w-full min-w-0 space-y-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 text-xs"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="font-semibold whitespace-nowrap">{formatValue(item.value)}</span>
              <span className="text-muted-foreground whitespace-nowrap">
                ({Math.round((item.value / total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
