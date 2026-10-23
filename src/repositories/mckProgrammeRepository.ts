// Location: src/repositories/mckProgrammeRepository.ts
// Reads public MCK records and routes all management writes through admin-checked Supabase RPCs.
import { supabase } from "../lib/supabaseClient";
import type {
  MckAdminEventRow,
  MckCorporatePartnerRow,
  MckPartnershipTierRow,
  MckPublicPartnerRow,
} from "../types/database";

export interface SaveMckPartnershipTierInput {
  tierKey: string;
  name: string;
  priceKes: number;
  benefits: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface SaveMckPartnerInput {
  id: string | null;
  organisationName: string;
  publicName: string;
  partnershipType: "cash" | "in_kind";
  tierKey: string | null;
  description: string;
  status: "active" | "completed" | "inactive";
  isPublic: boolean;
  sortOrder: number;
}

export interface MckAdminEventPage {
  items: MckAdminEventRow[];
  totalItems: number;
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listPublicMckTiers(): Promise<MckPartnershipTierRow[]> {
  const { data, error } = await db()
    .from("mck_active_partnership_tiers")
    .select("tier_key, name, price_kes, benefits, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MckPartnershipTierRow[];
}

export async function listPublicMckPartners(): Promise<MckPublicPartnerRow[]> {
  const { data, error } = await db()
    .from("mck_public_partners")
    .select("id, public_name, partnership_type, tier_key, tier_name, description, sort_order")
    .order("sort_order", { ascending: true })
    .order("public_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MckPublicPartnerRow[];
}

export async function listMckAdminTiers(): Promise<MckPartnershipTierRow[]> {
  const { data, error } = await db()
    .from("mck_partnership_tiers")
    .select("tier_key, name, price_kes, benefits, sort_order, is_active, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MckPartnershipTierRow[];
}

export async function saveMckPartnershipTier(input: SaveMckPartnershipTierInput): Promise<void> {
  const { error } = await db().rpc("admin_save_mck_partnership_tier", {
    p_tier_key: input.tierKey,
    p_name: input.name,
    p_price_kes: input.priceKes,
    p_benefits: input.benefits,
    p_sort_order: input.sortOrder,
    p_is_active: input.isActive,
  });
  if (error) throw error;
}

export async function listMckAdminPartners(): Promise<MckCorporatePartnerRow[]> {
  const { data, error } = await db()
    .from("mck_corporate_partners")
    .select("id, organisation_name, public_name, partnership_type, tier_key, description, status, is_public, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("organisation_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MckCorporatePartnerRow[];
}

export async function saveMckPartner(input: SaveMckPartnerInput): Promise<string> {
  const { data, error } = await db().rpc("admin_save_mck_partner", {
    p_partner_id: input.id,
    p_organisation_name: input.organisationName,
    p_public_name: input.publicName,
    p_partnership_type: input.partnershipType,
    p_tier_key: input.tierKey,
    p_description: input.description || null,
    p_status: input.status,
    p_is_public: input.isPublic,
    p_sort_order: input.sortOrder,
  });
  if (error) throw error;
  if (!data) throw new Error("The partner record was not returned after saving.");
  return data as string;
}

export async function listMckAdminEvents(page = 1, pageSize = 25, query = ""): Promise<MckAdminEventPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const { data, error } = await db().rpc("admin_list_mck_events_page", {
    p_limit: safePageSize,
    p_offset: (safePage - 1) * safePageSize,
    p_query: query.trim() || null,
  });
  if (error) throw error;
  let rows = (data ?? []) as Array<MckAdminEventRow & { total_count: number }>;
  if (rows.length === 0 && safePage > 1) {
    const { data: countData, error: countError } = await db().rpc("admin_list_mck_events_page", {
      p_limit: 1,
      p_offset: 0,
      p_query: query.trim() || null,
    });
    if (countError) throw countError;
    rows = (countData ?? []) as Array<MckAdminEventRow & { total_count: number }>;
    return { items: [], totalItems: rows[0]?.total_count ?? 0 };
  }
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      starts_at: row.starts_at,
      programme_slug: row.programme_slug,
    })),
    totalItems: rows[0]?.total_count ?? 0,
  };
}

export async function setMckEventTag(eventId: string, programmeSlug: string | null): Promise<void> {
  const { error } = await db().rpc("admin_set_mck_event_tag", {
    p_event_id: eventId,
    p_programme_slug: programmeSlug,
  });
  if (error) throw error;
}
