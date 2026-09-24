import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-saffron text-saffron-ink hover:bg-saffron-dark active:bg-saffron-dark disabled:bg-saffron/50",
  secondary:
    "bg-ink text-paper hover:bg-ink/85 active:bg-ink/85 dark:bg-ink-dark dark:text-paper-dark dark:hover:bg-ink-dark/85",
  outline:
    "border border-border-warm text-ink hover:bg-paper-raised dark:border-border-dark dark:text-ink-dark dark:hover:bg-surface-dark",
  ghost: "text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/5",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-md gap-1.5",
  md: "h-11 px-5 text-[0.95rem] rounded-lg gap-2",
  lg: "h-13 px-7 text-base rounded-lg gap-2",
};

/** Shared class builder so non-<button> elements (e.g. an <a> styled as a button) can match. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
