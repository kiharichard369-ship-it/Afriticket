import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 text-[0.95rem] text-ink placeholder:text-ink-faint",
        "focus:border-saffron-dark",
        "dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:placeholder:text-ink-soft-dark",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
