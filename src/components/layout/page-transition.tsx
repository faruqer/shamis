"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/70 py-16 px-8 text-center"
    >
      <div className="mb-4 rounded-full bg-primary-light p-4 text-primary">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

export function LoadingSpinner({
  message = "Loading data...",
  compact = false,
  className,
}: {
  message?: string | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "flex w-full flex-col items-center justify-center",
        compact ? "py-12" : "py-20",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message ?? "Loading"}
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-[3px] border-primary/15"
          aria-hidden
        />
        <motion.span
          className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary"
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-2 rounded-full border-[3px] border-transparent border-b-accent/80 border-l-accent/30"
          aria-hidden
          animate={{ rotate: -360 }}
          transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="h-3 w-3 rounded-full bg-primary shadow-sm shadow-primary/30"
          aria-hidden
          animate={{ scale: [1, 1.25, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="mt-5 text-sm font-medium tracking-wide text-muted-foreground"
        >
          {message}
        </motion.p>
      )}

      <div className="mt-4 flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/70"
            animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
            transition={{
              duration: 0.7,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.12,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
