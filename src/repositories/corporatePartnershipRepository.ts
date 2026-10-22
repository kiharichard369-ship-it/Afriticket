import { supabase } from "../lib/supabaseClient";
import type { PartnershipEnquiryStatus, PartnershipType, PartnershipTierKey } from "../data/mckPartnershipTiers";
import type { CorporatePartnershipEnquiryRow } from "../types/database";

// Location: src/repositories/corporatePartnershipRepository.ts
// Uses only Afriticket's configured Supabase project; no third-party programme feed.
export interface NewCorporatePartnershipEnquiry {
  organisationName: string;
  contactEmail: string;
  partnershipType: PartnershipType;
  tierKey: PartnershipTierKey | null;
  message: string;
  consentToContact: boolean;
  website: string;
}

let fallbackRateLimitKey: string | null = null;

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getRateLimitKey(): string {
  try {
    const existing = window.sessionStorage.getItem("afriticket.mck-enquiry-session");
    if (existing) return existing;
    const next = createUuid();
    window.sessionStorage.setItem("afriticket.mck-enquiry-session", next);
    return next;
  } catch {
    fallbackRateLimitKey ??= createUuid();
    return fallbackRateLimitKey;
  }
}

export async function submitCorporatePartnershipEnquiry(input: NewCorporatePartnershipEnquiry): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("submit_corporate_partnership_enquiry", {
    p_organisation_name: input.organisationName.trim(),
    p_contact_email: input.contactEmail.trim().toLowerCase(),
    p_partnership_type: input.partnershipType,
    p_tier_key: input.tierKey,
    p_message: input.message.trim() || null,
    p_consent_to_contact: input.consentToContact,
    p_rate_limit_key: getRateLimitKey(),
    p_website: input.website,
  });
  if (error) throw error;
}

export async function listCorporatePartnershipEnquiries(): Promise<CorporatePartnershipEnquiryRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("corporate_partnership_enquiries")
    .select("id, organisation_name, contact_email, partnership_type, tier_key, tier_name_snapshot, tier_price_snapshot, message, consent_to_contact, status, admin_notes, reviewed_by, reviewed_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as CorporatePartnershipEnquiryRow[] | null) ?? [];
}

export async function updateCorporatePartnershipEnquiry(
  enquiryId: string,
  status: PartnershipEnquiryStatus,
  adminNotes: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("set_corporate_partnership_enquiry_status", {
    p_enquiry_id: enquiryId,
    p_status: status,
    p_admin_notes: adminNotes.trim() || null,
  });
  if (error) throw error;
}
