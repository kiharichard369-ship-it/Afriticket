import { EVENTS, CATEGORIES, VENUES, summaryOf } from "../data/fixtures";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { SupabaseEventsRepository } from "./supabaseEventsRepository";
import type { Category, EventDetail, EventFilters, EventSummary, Paginated, Venue } from "../types/event";

/**
 * Every page and component talks to this interface, never to fixtures or a
 * database client directly. Phase 1 ships FixtureEventsRepository. Phase 2
 * adds a SupabaseEventsRepository that implements the same contract against
 * the tables in /supabase/migrations — no component changes required.
 */
export interface EventsRepository {
  listEvents(filters: EventFilters): Promise<Paginated<EventSummary>>;
  getEventBySlug(slug: string): Promise<EventDetail | null>;
  listCategories(): Promise<Category[]>;
  listTowns(): Promise<string[]>;
  listVenues(town?: string): Promise<Venue[]>;
  /** Map of ISO date (yyyy-MM-dd) -> number of published events starting that day, for the calendar view. */
  getMonthCounts(monthKey: string): Promise<Record<string, number>>;
}

const DEFAULT_PAGE_SIZE = 6;
// A small artificial delay so loading states are real and testable, matching
// how a network-backed repository will behave in Phase 2.
const SIMULATED_LATENCY_MS = 350;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7); // yyyy-MM
}

function dayKeyOf(iso: string): string {
  return iso.slice(0, 10); // yyyy-MM-dd
}

export class FixtureEventsRepository implements EventsRepository {
  private published() {
    return EVENTS.filter((e) => e.status === "published" || e.status === "sold_out");
  }

  async listEvents(filters: EventFilters): Promise<Paginated<EventSummary>> {
    let items = this.published().map(summaryOf);

    if (filters.query) {
      const q = filters.query.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.venue.town.toLowerCase().includes(q) ||
          e.venue.name.toLowerCase().includes(q) ||
          e.category.name.toLowerCase().includes(q)
      );
    }
    if (filters.categorySlug) {
      items = items.filter((e) => e.category.slug === filters.categorySlug);
    }
    if (filters.town) {
      items = items.filter((e) => e.venue.town === filters.town);
    }
    if (filters.venueId) {
      items = items.filter((e) => e.venue.id === filters.venueId);
    }
    if (filters.month) {
      items = items.filter((e) => monthKeyOf(e.startsAt) === filters.month);
    }
    if (typeof filters.minPriceMinor === "number") {
      const min = filters.minPriceMinor;
      items = items.filter((e) => e.priceFromMinor !== null && e.priceFromMinor >= min);
    }
    if (typeof filters.maxPriceMinor === "number") {
      const max = filters.maxPriceMinor;
      items = items.filter((e) => e.priceFromMinor !== null && e.priceFromMinor <= max);
    }

    const sort = filters.sort ?? "date_asc";
    items = [...items].sort((a, b) => {
      switch (sort) {
        case "date_desc":
          return b.startsAt.localeCompare(a.startsAt);
        case "price_asc":
          return (a.priceFromMinor ?? Infinity) - (b.priceFromMinor ?? Infinity);
        case "price_desc":
          return (b.priceFromMinor ?? -Infinity) - (a.priceFromMinor ?? -Infinity);
        case "date_asc":
        default:
          return a.startsAt.localeCompare(b.startsAt);
      }
    });

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    return delay({ items: pageItems, page, pageSize, totalItems, totalPages });
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const found = this.published().find((e) => e.slug === slug) ?? null;
    return delay(found);
  }

  async listCategories(): Promise<Category[]> {
    return delay(CATEGORIES);
  }

  async listTowns(): Promise<string[]> {
    const towns = Array.from(new Set(VENUES.map((v) => v.town))).sort();
    return delay(towns);
  }

  async listVenues(town?: string): Promise<Venue[]> {
    const venues = town ? VENUES.filter((v) => v.town === town) : VENUES;
    return delay(venues);
  }

  async getMonthCounts(monthKey: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const e of this.published()) {
      if (monthKeyOf(e.startsAt) !== monthKey) continue;
      const day = dayKeyOf(e.startsAt);
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return delay(counts);
  }
}

// Single shared instance used across the app. Once Supabase credentials are
// present in .env, this automatically switches to live data — no component
// changes required, per the interface above.
export const eventsRepository: EventsRepository = isSupabaseConfigured
  ? new SupabaseEventsRepository()
  : new FixtureEventsRepository();
