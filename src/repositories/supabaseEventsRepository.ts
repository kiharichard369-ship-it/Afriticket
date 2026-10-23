// Location: src/repositories/supabaseEventsRepository.ts
import { supabase } from "../lib/supabaseClient";
import type { EventsRepository } from "./eventsRepository";
import type { Category, EventDetail, EventFilters, EventSummary, Paginated, Venue } from "../types/event";
import type { CategoryRow, EventPartnershipPublicPartnerRow, EventPublicPricedRow, EventPublicRow, TicketTypePublicRow, VenueRow } from "../types/database";

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
function toSummary(row: EventPublicRow, ticketTypes: TicketTypePublicRow[], priceOverride?: number | null): EventSummary {
  const available = ticketTypes.filter((t) => t.remaining > 0);
  const calculatedPrice = available.length ? Math.min(...available.map((t) => t.price_minor)) : null;
  const priceFromMinor = priceOverride === undefined ? calculatedPrice : priceOverride;
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
    programmeSlug: row.programme_slug,
  };
}

const EVENT_PUBLIC_SELECT = "*";

function normalizedSearchTerm(value: string): string {
  // .or() uses these characters as filter grammar; remove them before embedding
  // a user-entered term in a multi-column PostgREST expression.
  return value.trim().replace(/[\\%_*(),."']/g, " ").replace(/\s+/g, " ").slice(0, 120).trim();
}

function emptyPage(page: number, pageSize: number): Paginated<EventSummary> {
  return { items: [], page, pageSize, totalItems: 0, totalPages: 1 };
}

export class SupabaseEventsRepository implements EventsRepository {
  private client() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  async listEvents(filters: EventFilters): Promise<Paginated<EventSummary>> {
    const db = this.client();
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(filters.pageSize ?? 6)));
    const queryText = filters.query ? normalizedSearchTerm(filters.query) : "";
    if (filters.query?.trim() && !queryText) return emptyPage(page, pageSize);

    let query = db.from("events_public_priced").select(EVENT_PUBLIC_SELECT, { count: "exact" });

    if (queryText) {
      const pattern = `%${queryText}%`;
      query = query.or([
        `title.ilike.${pattern}`,
        `venue_name.ilike.${pattern}`,
        `venue_town.ilike.${pattern}`,
        `category_name.ilike.${pattern}`,
      ].join(","));
    }
    if (filters.programmeSlug) query = query.eq("programme_slug", filters.programmeSlug);
    if (filters.categorySlug) query = query.eq("category_slug", filters.categorySlug);
    if (filters.town) query = query.eq("venue_town", filters.town);
    if (filters.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)) {
      const [year, month] = filters.month.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 1)).toISOString();
      query = query.gte("starts_at", start).lt("starts_at", end);
    }
    if (typeof filters.minPriceMinor === "number" && Number.isFinite(filters.minPriceMinor)) {
      query = query.gte("price_from_minor", filters.minPriceMinor);
    }
    if (typeof filters.maxPriceMinor === "number" && Number.isFinite(filters.maxPriceMinor)) {
      query = query.lte("price_from_minor", filters.maxPriceMinor);
    }

    switch (filters.sort ?? "date_asc") {
      case "date_desc":
        query = query.order("starts_at", { ascending: false }).order("id", { ascending: true });
        break;
      case "price_asc":
        query = query.order("price_from_minor", { ascending: true, nullsFirst: false })
          .order("starts_at", { ascending: true }).order("id", { ascending: true });
        break;
      case "price_desc":
        query = query.order("price_from_minor", { ascending: false, nullsFirst: false })
          .order("starts_at", { ascending: true }).order("id", { ascending: true });
        break;
      case "date_asc":
      default:
        query = query.order("starts_at", { ascending: true }).order("id", { ascending: true });
        break;
    }

    const startIndex = (page - 1) * pageSize;
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as EventPublicPricedRow[];
    const items = rows.map((row) => toSummary(row, [], row.price_from_minor));
    const totalItems = count ?? 0;
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

    // The view itself enforces paid/public eligibility. A missing partnership
    // migration must not prevent an otherwise valid event from loading.
    const { data: partnerRows } = await db
      .from("event_partners_public")
      .select("id, event_id, partner_name, package_name, category, offered_services, logo_path, confirmed_at")
      .eq("event_id", row.id)
      .order("confirmed_at", { ascending: false });
    const partners = await Promise.all(((partnerRows ?? []) as EventPartnershipPublicPartnerRow[]).map(async (partner) => {
      let logoUrl: string | undefined;
      if (partner.logo_path) {
        const { data: signedLogo } = await db.storage.from("event-partner-logos").createSignedUrl(partner.logo_path, 900);
        logoUrl = signedLogo?.signedUrl;
      }
      return {
        id: partner.id,
        partnerName: partner.partner_name,
        packageName: partner.package_name,
        category: partner.category,
        offeredServices: partner.offered_services,
        logoUrl,
        confirmedAt: partner.confirmed_at,
      };
    }));

    return {
      ...summary,
      description: row.description,
      organiserName: row.organiser_name,
      partners,
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
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return {};
    const db = this.client();
    const [year, month] = monthKey.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(year, month, 1)).toISOString();
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
}
