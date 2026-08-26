import { cn } from "@/lib/utils";
import { InputHTMLAttributes, WheelEvent, forwardRef } from "react";

/** Stop trackpad/mouse wheel from changing number input values while scrolling. */
export function blurNumberInputOnWheel(event: WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onWheel, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      onWheel={(event) => {
        if (type === "number") {
          blurNumberInputOnWheel(event);
        }
        onWheel?.(event);
      }}
      {...props}
    />
  )
);
Input.displayName = "Input";
