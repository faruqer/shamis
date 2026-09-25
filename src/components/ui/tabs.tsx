"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabDef<T extends string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  /** Short label used on narrow screens where the full one would wrap. */
  shortLabel?: string;
}

/**
 * Horizontal tab bar. On narrow screens the list scrolls sideways instead of
 * wrapping, so a four- or five-tab page stays usable on a phone.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span className="whitespace-nowrap">
              {tab.shortLabel ? (
                <>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </span>
            {active && (
              <motion.span
                layoutId="tab-underline"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
