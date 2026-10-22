import { ArrowRight, Check } from "lucide-react";
import { Button } from "../ui/Button";
import type { PartnershipTier } from "../../data/mckPartnershipTiers";

// Location: src/components/programmes/MckPartnerTierCard.tsx
// Afriticket's reusable display for locally maintained programme levels.
interface MckPartnerTierCardProps {
  tier: PartnershipTier;
  index: number;
  selected: boolean;
  onSelect: (tier: PartnershipTier) => void;
}

export function MckPartnerTierCard({ tier, index, selected, onSelect }: MckPartnerTierCardProps) {
  const headingId = `mck-tier-${tier.key}`;

  return (
    <article
      aria-labelledby={headingId}
      className={`flex h-full flex-col rounded-2xl border bg-paper-raised p-5 shadow-sm transition dark:bg-surface-dark sm:p-6 ${
        selected
          ? "border-[#7b2144] ring-2 ring-[#7b2144]/15 dark:border-[#cf8ca7] dark:ring-[#cf8ca7]/20"
          : "border-border-warm dark:border-border-dark"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint dark:text-ink-soft-dark">
          Level {String(index + 1).padStart(2, "0")}
        </span>
        {selected && (
          <span className="rounded-full bg-[#7b2144]/10 px-2.5 py-1 text-xs font-semibold text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]">
            Selected
          </span>
        )}
      </div>
      <h3 id={headingId} className="mt-4 font-display text-xl font-semibold leading-tight text-ink dark:text-ink-dark">
        {tier.name}
      </h3>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-[#7b2144] dark:text-[#f1c8d7]">
        {tier.priceLabel}
      </p>
      <p className="mt-1 text-xs text-ink-faint dark:text-ink-soft-dark">Contribution level</p>
      <div className="my-5 h-px bg-border-warm dark:bg-border-dark" />
      <ul className="flex-1 space-y-3 text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">
        {tier.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7b2144] dark:text-[#f1c8d7]" aria-hidden="true" />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant={selected ? "secondary" : "outline"}
        className="mt-6 w-full justify-between"
        onClick={() => onSelect(tier)}
        aria-label={`Ask about the ${tier.name} package`}
      >
        <span>{selected ? "Package selected" : "Ask about this level"}</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </article>
  );
}
