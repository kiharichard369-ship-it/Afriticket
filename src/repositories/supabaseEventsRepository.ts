import { supabase } from "../lib/supabaseClient";
import type { EventsRepository } from "./eventsRepository";
import type { Category, EventDetail, EventFilters, EventSummary, Paginated, Venue } from "../types/event";
import type { CategoryRow, EventPublicRow, TicketTypePublicRow, VenueRow } from "../types/database";

function ctaFor(row: EventPublicRow, priceFromMinor: number | null): EventSummary["ctaLabel"] {
  if (row.status === "sold_out" || priceFromMinor === null) return "Sold out";
  if (row.is_free) return "Donate";
  return "Get tickets";
}

// Flattened columns from the events_public view — not embedded resources.
// PostgREST's automatic embedding (category:categories(*)) is detected
// from real foreign-key constraints on tables; a view has none, so
// embedding through it is unreliable. Flattening avoids the problem
// entirely — see the comment on events_public in migration 0012.
function toSummary(row: EventPublicRow, ticketTypes: TicketTypePublicRow[]): EventSummary {
  const available = ticketTypes.filter((t) => t.remaining > 0);
  const priceFromMinor = available.length ? Math.min(...available.map((t) => t.price_minor)) : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    venue: { id: row.venue_id, name: row.venue_name, town: row.venue_town, address: row.venue_address ?? undefined },
    coverImageUrl: row.cover_image_url ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    timezone: row.timezone,
    priceFromMinor,
    currency: "KES",
    ctaLabel: ctaFor(row, priceFromMinor),
    isFree: row.is_free,
  };
}

const EVENT_PUBLIC_SELECT = "*";

export class SupabaseEventsRepository implements EventsRepository {
  private client() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  async listEvents(filters: EventFilters): Promise<Paginated<EventSummary>> {
    const db = this.client();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? 6;

    let query = db.from("events_public").select(EVENT_PUBLIC_SELECT, { count: "exact" });

    if (filters.query) query = query.ilike("title", `%${filters.query}%`);
    if (filters.categorySlug) query = query.eq("category_slug", filters.categorySlug);
    if (filters.town) query = query.eq("venue_town", filters.town);
    if (filters.month) {
      const [y, m] = filters.month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const end = new Date(Date.UTC(y, m, 1)).toISOString();
      query = query.gte("starts_at", start).lt("starts_at", end);
    }

    query = query.order("starts_at", { ascending: filters.sort !== "date_desc" });

    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as EventPublicRow[];
    const ticketTypesByEvent = await this.ticketTypesForEvents(rows.map((r) => r.id));
    let items = rows.map((r) => toSummary(r, ticketTypesByEvent[r.id] ?? []));

    if (typeof filters.minPriceMinor === "number") {
      items = items.filter((e) => e.priceFromMinor !== null && e.priceFromMinor! >= filters.minPriceMinor!);
    }
    if (typeof filters.maxPriceMinor === "number") {
      items = items.filter((e) => e.priceFromMinor !== null && e.priceFromMinor! <= filters.maxPriceMinor!);
    }
    if (filters.sort === "price_asc") items = [...items].sort((a, b) => (a.priceFromMinor ?? Infinity) - (b.priceFromMinor ?? Infinity));
    if (filters.sort === "price_desc") items = [...items].sort((a, b) => (b.priceFromMinor ?? -Infinity) - (a.priceFromMinor ?? -Infinity));

    const totalItems = count ?? items.length;
    return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const db = this.client();
    const { data, error } = await db.from("events_public").select(EVENT_PUBLIC_SELECT).eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as EventPublicRow;
    const { data: ticketRows, error: ttError } = await db
      .from("ticket_types_public")
      .select("*")
      .eq("event_id", row.id);
    if (ttError) throw ttError;

    const ticketTypes = (ticketRows ?? []) as unknown as TicketTypePublicRow[];
    const summary = toSummary(row, ticketTypes);

    return {
      ...summary,
      description: row.description,
      organiserName: row.organiser_name,
      ticketTypes: ticketTypes.map((t) => ({
        id: t.id,
        eventId: t.event_id,
        name: t.name,
        description: t.description ?? undefined,
        priceMinor: t.price_minor,
        currency: "KES",
        capacity: t.remaining, // capacity is intentionally not exposed publicly; remaining stands in for display purposes
        remaining: t.remaining,
        perOrderLimit: t.per_order_limit,
      })),
    };
  }

  async listCategories(): Promise<Category[]> {
    const db = this.client();
    const { data, error } = await db.from("categories").select("*").order("sort_order");
    if (error) throw error;
    return ((data ?? []) as unknown as CategoryRow[]).map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
  }

  async listTowns(): Promise<string[]> {
    const db = this.client();
    const { data, error } = await db.from("venues").select("town");
    if (error) throw error;
    const towns = new Set((data ?? []).map((v) => (v as { town: string }).town));
    return Array.from(towns).sort();
  }

  async listVenues(town?: string): Promise<Venue[]> {
    const db = this.client();
    let query = db.from("venues").select("*");
    if (town) query = query.eq("town", town);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as VenueRow[]).map((v) => ({
      id: v.id,
      name: v.name,
      town: v.town,
      address: v.address ?? undefined,
    }));
  }

  async getMonthCounts(monthKey: string): Promise<Record<string, number>> {
    const db = this.client();
    const [y, m] = monthKey.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();
    const { data, error } = await db
      .from("events_public")
      .select("starts_at")
      .gte("starts_at", start)
      .lt("starts_at", end);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const day = (row as { starts_at: string }).starts_at.slice(0, 10);
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return counts;
  }

  private async ticketTypesForEvents(eventIds: string[]): Promise<Record<string, TicketTypePublicRow[]>> {
    if (eventIds.length === 0) return {};
    const db = this.client();
    const { data, error } = await db.from("ticket_types_public").select("*").in("event_id", eventIds);
    if (error) throw error;
    const grouped: Record<string, TicketTypePublicRow[]> = {};
    for (const row of (data ?? []) as unknown as TicketTypePublicRow[]) {
      (grouped[row.event_id] ??= []).push(row);
    }
    return grouped;
  }
}
