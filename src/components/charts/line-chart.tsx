"use client";

import { cn } from "@/lib/utils";

export interface LineChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function LineChart({
  labels,
  series,
  height = 220,
  formatValue = (v) => String(v),
  className,
}: LineChartProps) {
  const width = 640;
  const padding = { top: 16, right: 16, bottom: 36, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);
  const range = maxValue - minValue || 1;

  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : innerW;

  function y(value: number) {
    return padding.top + innerH - ((value - minValue) / range) * innerH;
  }

  function x(index: number) {
    return padding.left + index * xStep;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full h-auto">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = minValue + range * tick;
          const yy = y(value);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={yy}
                x2={width - padding.right}
                y2={yy}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={padding.left - 8}
                y={yy + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {formatValue(value)}
              </text>
            </g>
          );
        })}

        {series.map((s) => {
          const points = s.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
          return (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
              {s.values.map((value, index) => (
                <circle
                  key={`${s.key}-${index}`}
                  cx={x(index)}
                  cy={y(value)}
                  r={3.5}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => {
          const step = labels.length <= 14 ? 1 : Math.ceil(labels.length / 12);
          if (index % step !== 0 && index !== labels.length - 1) return null;
          return (
            <text
              key={`${label}-${index}`}
              x={x(index)}
              y={height - 10}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {label}
            </text>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 justify-center">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
