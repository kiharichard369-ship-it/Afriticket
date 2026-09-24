import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Tone = "saffron" | "sage" | "rust" | "neutral";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  // /10 rather than /15: at /15 the tinted background brings saffron-text,
  // sage, and rust text just under the 4.5:1 WCAG AA threshold (verified
  // by computing actual contrast ratios, not eyeballed — see
  // supabase/ACCESSIBILITY.md). /10 clears 4.5:1 for all three with a
  // small margin, and looks effectively the same at this size.
  saffron: "bg-saffron/10 text-saffron-text dark:text-saffron",
  sage: "bg-sage/10 text-sage",
  rust: "bg-rust/10 text-rust",
  neutral: "bg-ink/8 text-ink-soft dark:bg-white/10 dark:text-ink-soft-dark",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
