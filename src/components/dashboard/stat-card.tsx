"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ProfitEyeToggle, PROFIT_MASK } from "@/components/ui/profit-reveal";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  delay?: number;
  valueClassName?: string;
  compact?: boolean;
  sensitive?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  delay = 0,
  valueClassName,
  compact = false,
  sensitive = false,
}: StatCardProps) {
  const [profitVisible, setProfitVisible] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: compact ? -4 : -8,
        scale: compact ? 1.01 : 1.03,
        transition: { duration: 0.25, ease: "easeOut" },
      }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        compact ? "p-4" : "p-6",
        "transition-shadow duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-300 group-hover:scale-150" />

      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <p className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>
              {title}
            </p>
            {sensitive ? (
              <ProfitEyeToggle
                visible={profitVisible}
                onToggle={() => setProfitVisible((current) => !current)}
              />
            ) : null}
          </div>
          <p
            className={cn(
              "break-words font-bold leading-tight tracking-tight transition-colors duration-300 group-hover:text-primary",
              compact ? "text-xl" : "text-2xl",
              valueClassName
            )}
          >
            {sensitive && !profitVisible ? PROFIT_MASK : value}
          </p>
          {!compact && subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {!compact && trend && (
            <p className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/25",
            compact ? "h-9 w-9" : "h-11 w-11"
          )}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
