import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useEventDiscovery } from "../hooks/useEventDiscovery";
import { FiltersBar } from "../components/events/FiltersBar";
import { EventGrid } from "../components/events/EventGrid";
import { LoadMore } from "../components/events/LoadMore";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { CalendarClock } from "lucide-react";
import { siteSettingsRepository } from "../repositories/siteSettingsRepository";

export function DiscoveryPage() {
  const { filters, updateFilters, clearFilters, events, status, hasMore, loadMore, totalItems } = useEventDiscovery();
  const [searchParams] = useSearchParams();
  const autoFocusSearch = searchParams.get("focus") === "search";
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  useEffect(() => {
    siteSettingsRepository.getPublic().then((settings) => {
      setWallpaperUrl(settings.landingThemeEvent?.cover_image_url ?? settings.automaticThemeEvent?.cover_image_url ?? settings.wallpaperUrl);
    }).catch(() => undefined);
  }, []);

  return (
    <div>
      <section
        className="relative overflow-hidden border-b border-border-warm bg-paper-raised bg-cover bg-center dark:border-border-dark dark:bg-surface-dark"
        style={{ backgroundImage: `url(${wallpaperUrl ?? "/backgrounds/afriticket-hero.jpg"})` }}
      >
        {/* Strong behind the text, fading away so the picture shows clearly. Top-to-bottom on phones. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper-raised/85 via-paper-raised/60 to-paper-raised/25 dark:from-surface-dark/85 dark:via-surface-dark/60 dark:to-surface-dark/25 sm:bg-gradient-to-r sm:from-paper-raised/90 sm:via-paper-raised/50 sm:to-paper-raised/0 sm:dark:from-surface-dark/90 sm:dark:via-surface-dark/50 sm:dark:to-surface-dark/0" />
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-blob rounded-full bg-saffron/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-10 h-64 w-64 animate-blob rounded-full bg-rust/20 blur-3xl [animation-delay:3s]" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-56 w-56 animate-blob rounded-full bg-sage/25 blur-3xl [animation-delay:6s]" />

        <div className="relative mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <p className="animate-fade-in-up font-medium text-saffron-text dark:text-saffron">Kenya, town by town</p>
          <h1 className="mt-2 max-w-2xl animate-fade-in-up font-display text-4xl font-semibold leading-tight text-ink [animation-delay:80ms] dark:text-ink-dark sm:text-5xl">
            Find what's on near you, from Nakuru's stages to Nairobi's grounds.
          </h1>
          <p className="mt-4 max-w-xl animate-fade-in-up text-ink-soft [animation-delay:160ms] dark:text-ink-soft-dark">
            Concerts, comedy, markets, matches, and community days — filtered by town, month, and
            budget, with every ticket accounted for at the door.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 animate-fade-in-up [animation-delay:240ms]">
            {[
              { label: "Live events", value: `${totalItems || "—"}` , tone: "bg-saffron/15 text-saffron-text dark:text-saffron" },
              { label: "Towns covered", value: "9", tone: "bg-sage/15 text-sage" },
              { label: "Free listings", value: "2+", tone: "bg-rust/15 text-rust" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl px-4 py-2 text-sm font-semibold ${stat.tone}`}>
                {stat.value} <span className="font-normal text-ink-soft dark:text-ink-soft-dark">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-border-warm dark:border-border-dark">
        <div className="pointer-events-none absolute inset-0 bg-[url('/backgrounds/afriticket-events.jpg')] bg-cover bg-center opacity-[0.08] dark:opacity-[0.12]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8">
          <FiltersBar filters={filters} onChange={updateFilters} onClear={clearFilters} autoFocusSearch={autoFocusSearch} />

          <div className="mt-8">
          {status === "error" ? (
            <ErrorState onRetry={() => updateFilters({})} />
          ) : status === "loading" ? (
            <EventGrid events={[]} />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-8 w-8 text-ink-faint" />}
              title="No events match those filters"
              description="Try widening your date range, clearing the price filter, or searching a different town."
              actionLabel="Clear all filters"
              onAction={clearFilters}
            />
          ) : (
            <>
              <EventGrid events={events} />
              <LoadMore
                hasMore={hasMore}
                loading={status === "loading-more"}
                onClick={loadMore}
                shown={events.length}
                total={totalItems}
              />
            </>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}