import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-warm bg-paper-raised shadow-[0_2px_0_0_var(--color-border-warm)]",
        "dark:border-border-dark dark:bg-surface-dark dark:shadow-[0_2px_0_0_var(--color-border-dark)]",
        className
      )}
      {...props}
    />
  );
}
