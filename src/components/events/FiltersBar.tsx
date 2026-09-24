import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { eventsRepository } from "../../repositories/eventsRepository";
import type { Category, EventFilters } from "../../types/event";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { categoryVisual } from "./categoryVisual";

interface FiltersBarProps {
  filters: EventFilters;
  onChange: (patch: Partial<EventFilters>) => void;
  onClear: () => void;
  autoFocusSearch?: boolean;
}

export function FiltersBar({ filters, onChange, onClear, autoFocusSearch }: FiltersBarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [towns, setTowns] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState(filters.query ?? "");

  useEffect(() => {
    eventsRepository.listCategories().then(setCategories);
    eventsRepository.listTowns().then(setTowns);
  }, []);

  useEffect(() => {
    setSearchDraft(filters.query ?? "");
  }, [filters.query]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (searchDraft !== (filters.query ?? "")) onChange({ query: searchDraft || undefined });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const hasActiveFilters =
    filters.query || filters.categorySlug || filters.town || filters.month || filters.minPriceMinor || filters.maxPriceMinor;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          autoFocus={autoFocusSearch}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search events, venues, or towns"
          aria-label="Search events"
          className="pl-10"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by category"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          onClick={() => onChange({ categorySlug: undefined })}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
            !filters.categorySlug
              ? "border-ink bg-ink text-paper dark:border-ink-dark dark:bg-ink-dark dark:text-ink"
              : "border-border-warm text-ink-soft hover:bg-ink/5 dark:border-border-dark dark:text-ink-soft-dark dark:hover:bg-white/10"
          }`}
        >
          All
        </button>
        {categories.map((c) => {
          const visual = categoryVisual(c.slug);
          const active = filters.categorySlug === c.slug;
          return (
            <button
              key={c.id}
              onClick={() => onChange({ categorySlug: active ? undefined : c.slug })}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                active ? visual.chipActive : visual.chipIdle
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Select
          aria-label="Town"
          value={filters.town ?? ""}
          onChange={(e) => onChange({ town: e.target.value || undefined })}
        >
          <option value="">All towns</option>
          {towns.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <Select
          aria-label="Month"
          value={filters.month ?? ""}
          onChange={(e) => onChange({ month: e.target.value || undefined })}
        >
          <option value="">Any month</option>
          {monthOptions().map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>

        <Input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label="Minimum price in KES"
          placeholder="Min KES"
          value={filters.minPriceMinor !== undefined ? filters.minPriceMinor / 100 : ""}
          onChange={(e) => onChange({ minPriceMinor: e.target.value ? Number(e.target.value) * 100 : undefined })}
        />

        <Input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label="Maximum price in KES"
          placeholder="Max KES"
          value={filters.maxPriceMinor !== undefined ? filters.maxPriceMinor / 100 : ""}
          onChange={(e) => onChange({ maxPriceMinor: e.target.value ? Number(e.target.value) * 100 : undefined })}
        />

        <Select
          aria-label="Sort by"
          value={filters.sort ?? "date_asc"}
          onChange={(e) => onChange({ sort: e.target.value as EventFilters["sort"] })}
        >
          <option value="date_asc">Soonest first</option>
          <option value="date_desc">Latest first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-ink-soft dark:text-ink-soft-dark">
          <X className="h-4 w-4" /> Clear filters
        </Button>
      )}
    </div>
  );
}

function monthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}
