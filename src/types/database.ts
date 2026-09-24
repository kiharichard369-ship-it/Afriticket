// Minimal, hand-authored types matching /supabase/migrations. Once you run
// `supabase login && supabase link` against your real project, replace this
// file with the output of:
//   supabase gen types typescript --linked > src/types/database.ts

export type EventStatusRow =
  | "draft" | "pending_review" | "published" | "paused" | "sold_out" | "completed" | "cancelled" | "archived";

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface VenueRow {
  id: string;
  organisation_id: string | null;
  name: string;
  town: string;
  address: string | null;
}

export interface EventRow {
  id: string;
  organisation_id: string;
  category_id: string;
  venue_id: string;
  slug: string;
  title: string;
  description: string;
  status: EventStatusRow;
  cover_image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  is_free: boolean;
  moderation_reason: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category?: CategoryRow;
  venue?: VenueRow;
}

export interface EventPublicRow {
  id: string;
  organisation_id: string;
  slug: string;
  title: string;
  description: string;
  status: EventStatusRow;
  cover_image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  is_free: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  venue_id: string;
  venue_name: string;
  venue_town: string;
  venue_address: string | null;
  organiser_name: string;
}

export interface TicketTypePublicRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  per_order_limit: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  remaining: number;
}

export interface TicketTypeRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  capacity: number;
  per_order_limit: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
}

export type OrganisationRoleRow = "owner" | "manager" | "editor" | "finance" | "checkin_staff";

export interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  trading_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  is_approved: boolean;
}

export interface OrganisationMemberRow {
  organisation_id: string;
  user_id: string;
  role: OrganisationRoleRow;
  organisation?: OrganisationRow;
}

export type ApplicationStatusRow = "pending" | "approved" | "rejected";

export interface OrganiserApplicationRow {
  id: string;
  applicant_id: string;
  organisation_name: string;
  trading_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  status: ApplicationStatusRow;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  organisation_id: string | null;
  created_at: string;
}
