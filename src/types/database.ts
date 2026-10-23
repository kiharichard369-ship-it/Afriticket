// Location: src/types/database.ts
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
  programme_slug: string | null;
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
  is_featured: boolean;
  programme_slug: string | null;
}

// Location: src/types/database.ts — row returned by events_public_priced (migration 0029).
export interface EventPublicPricedRow extends EventPublicRow {
  price_from_minor: number | null;
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
export type CorporatePartnershipTypeRow = "cash" | "in_kind";
export type CorporatePartnershipTierRow = string;
export type CorporatePartnershipStatusRow = "new" | "in_progress" | "contacted" | "closed" | "spam";

export interface CorporatePartnershipEnquiryRow {
  id: string;
  organisation_name: string;
  contact_email: string;
  partnership_type: CorporatePartnershipTypeRow;
  tier_key: CorporatePartnershipTierRow | null;
  tier_name_snapshot: string | null;
  tier_price_snapshot: number | null;
  message: string | null;
  consent_to_contact: boolean;
  status: CorporatePartnershipStatusRow;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MckPartnershipTierRow {
  tier_key: string;
  name: string;
  price_kes: number;
  benefits: string[];
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type MckPartnerStatusRow = "active" | "completed" | "inactive";

export interface MckCorporatePartnerRow {
  id: string;
  organisation_name: string;
  public_name: string;
  partnership_type: CorporatePartnershipTypeRow;
  tier_key: string | null;
  description: string | null;
  status: MckPartnerStatusRow;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MckPublicPartnerRow {
  id: string;
  public_name: string;
  partnership_type: CorporatePartnershipTypeRow;
  tier_key: string | null;
  tier_name: string | null;
  description: string | null;
  sort_order: number;
}

export interface MckAdminEventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  starts_at: string;
  programme_slug: string | null;
}

export interface EventPartnershipPublicPackageRow {
  id: string;
  event_id: string;
  category: string;
  name: string;
  service_description: string;
  price_kes: number;
  sort_order: number;
}

export interface EventPartnershipPublicPartnerRow {
  id: string;
  event_id: string;
  partner_name: string;
  package_name: string;
  category: string;
  offered_services: string;
  logo_path: string | null;
  confirmed_at: string | null;
}

export interface EventPartnershipPackageRow extends EventPartnershipPublicPackageRow {
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventPartnershipAdminEventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  starts_at: string;
}

export interface EventPartnershipAdminApplicationRow {
  id: string;
  event_id: string;
  event_title: string;
  public_reference: string;
  applicant_name: string;
  business_name: string;
  contact_email: string;
  contact_phone: string;
  category: string;
  package_name: string;
  price_kes: number;
  offered_services: string;
  logo_path: string | null;
  status: "awaiting_payment" | "paid" | "cancelled";
  is_public: boolean;
  created_at: string;
  confirmed_at: string | null;
}

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
