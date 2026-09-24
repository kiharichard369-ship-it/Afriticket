// Domain types for the public catalog. These mirror the Supabase schema in
// /supabase/migrations so the repository layer can swap fixtures for real
// queries later without touching any component.

export type EventStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "paused"
  | "sold_out"
  | "completed"
  | "cancelled"
  | "archived";

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  /** Minor currency units (cents), never a float. */
  priceMinor: number;
  currency: "KES";
  capacity: number;
  remaining: number;
  perOrderLimit: number;
}

export interface Venue {
  id: string;
  name: string;
  town: string;
  address?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  category: Category;
  venue: Venue;
  coverImageUrl?: string;
  /** ISO 8601, always stored/queried in UTC and normalized for display. */
  startsAt: string;
  endsAt?: string;
  timezone: string;
  /** Cheapest available ticket price in minor units, for card display. */
  priceFromMinor: number | null;
  currency: "KES";
  ctaLabel: "Get tickets" | "Reserve a spot" | "Donate" | "Sold out";
  isFree: boolean;
}

export interface EventDetail extends EventSummary {
  description: string;
  organiserName: string;
  ticketTypes: TicketType[];
  ageLimit?: string;
  accessibilityNotes?: string;
  refundPolicySummary?: string;
}

export interface EventFilters {
  query?: string;
  categorySlug?: string;
  town?: string;
  venueId?: string;
  /** "2026-10" style month key. */
  month?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: "date_asc" | "date_desc" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
