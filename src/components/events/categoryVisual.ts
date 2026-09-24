import { Briefcase, Drama, Laugh, Music2, PartyPopper, Trophy, Users2, Baby } from "lucide-react";
import type { ComponentType } from "react";

interface CategoryVisual {
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  glow: string;
  chipActive: string;
  chipIdle: string;
}

const VISUALS: Record<string, CategoryVisual> = {
  music: {
    icon: Music2,
    gradient: "from-saffron via-amber-400 to-rust",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(226,163,53,0.55)]",
    chipActive: "bg-saffron text-saffron-ink border-saffron",
    chipIdle: "border-saffron/40 text-saffron-text hover:bg-saffron/10 dark:text-saffron",
  },
  nightlife: {
    icon: PartyPopper,
    gradient: "from-fuchsia-500 via-rust to-ink",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(166,67,43,0.55)]",
    chipActive: "bg-rust text-paper border-rust",
    chipIdle: "border-rust/40 text-rust hover:bg-rust/10",
  },
  "arts-theatre": {
    icon: Drama,
    gradient: "from-sage via-emerald-500 to-ink",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(92,107,71,0.55)]",
    chipActive: "bg-sage text-paper border-sage",
    chipIdle: "border-sage/40 text-sage hover:bg-sage/10",
  },
  comedy: {
    icon: Laugh,
    gradient: "from-saffron via-orange-400 to-sage",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(226,163,53,0.55)]",
    chipActive: "bg-saffron text-saffron-ink border-saffron",
    chipIdle: "border-saffron/40 text-saffron-text hover:bg-saffron/10 dark:text-saffron",
  },
  sports: {
    icon: Trophy,
    gradient: "from-sage via-lime-500 to-saffron",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(92,107,71,0.55)]",
    chipActive: "bg-sage text-paper border-sage",
    chipIdle: "border-sage/40 text-sage hover:bg-sage/10",
  },
  business: {
    icon: Briefcase,
    gradient: "from-ink via-stone-700 to-rust",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(32,26,18,0.45)]",
    chipActive: "bg-ink text-paper border-ink dark:bg-ink-dark dark:text-ink",
    chipIdle: "border-ink/30 text-ink hover:bg-ink/10 dark:border-ink-dark/40 dark:text-ink-dark",
  },
  culture: {
    icon: Users2,
    gradient: "from-rust via-orange-500 to-saffron",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(166,67,43,0.55)]",
    chipActive: "bg-rust text-paper border-rust",
    chipIdle: "border-rust/40 text-rust hover:bg-rust/10",
  },
  family: {
    icon: Baby,
    gradient: "from-saffron via-sky-400 to-sage",
    glow: "hover:shadow-[0_10px_30px_-8px_rgba(226,163,53,0.5)]",
    chipActive: "bg-saffron text-saffron-ink border-saffron",
    chipIdle: "border-saffron/40 text-saffron-text hover:bg-saffron/10 dark:text-saffron",
  },
};

const FALLBACK: CategoryVisual = VISUALS.music;

export function categoryVisual(slug: string): CategoryVisual {
  return VISUALS[slug] ?? FALLBACK;
}

export function allCategoryVisuals() {
  return VISUALS;
}
