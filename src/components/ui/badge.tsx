import { cn } from "@/lib/utils";

const variants = {
  default: "bg-muted text-muted-foreground",
  success: "bg-secondary text-secondary-foreground",
  warning: "bg-[#ddd0b8] text-[#5c4a28]",
  danger: "bg-[#e8d0d0] text-[#7a3a3a]",
  info: "bg-[#ccdbe8] text-[#2d4a62]",
  primary: "bg-primary-light text-primary-dark",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
