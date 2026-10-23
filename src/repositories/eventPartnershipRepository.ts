// Location: src/repositories/eventPartnershipRepository.ts
// Public intake and admin data access for event-specific partnerships.
import { supabase } from "../lib/supabaseClient";
import type {
  EventPartnershipAdminApplicationRow,
  EventPartnershipAdminEventRow,
  EventPartnershipPackageRow,
  EventPartnershipPublicPackageRow,
} from "../types/database";

export interface PartnershipApplicationInput {
  packageId: string;
  idempotencyKey: string;
  applicantName: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  offeredServices: string;
  honeypot?: string;
}

export interface PartnershipLogoUploadTarget {
  path: string;
  token: string;
}

export interface PartnershipPaymentStatus {
  status: "pending" | "succeeded" | "failed";
  applicationId: string;
  reference?: string;
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function edgeFunctionError(error: unknown, fallback: string): Promise<Error> {
  try {
    const response = (error as { context?: Response }).context;
    const body = await response?.json();
    if (body?.error) return new Error(String(body.error));
  } catch {
    // Fall through to the safe UI-level message.
  }
  return new Error(fallback);
}

export async function listPublicEventPartnershipPackages(eventId: string): Promise<EventPartnershipPublicPackageRow[]> {
  const { data, error } = await db()
    .from("event_partnership_packages_public")
    .select("id, event_id, category, name, service_description, price_kes, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EventPartnershipPublicPackageRow[];
}

export async function submitEventPartnershipApplication(input: PartnershipApplicationInput): Promise<string> {
  const { data, error } = await db().rpc("submit_event_partnership_application", {
    p_package_id: input.packageId,
    p_idempotency_key: input.idempotencyKey,
    p_applicant_name: input.applicantName,
    p_business_name: input.businessName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_offered_services: input.offeredServices,
    p_honeypot: input.honeypot ?? "",
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The application could not be created.");
  return data;
}

export async function requestEventPartnershipLogoUpload(applicationId: string, contentType: string): Promise<PartnershipLogoUploadTarget> {
  const { data, error } = await db().functions.invoke("event-partnership-logo-upload", {
    body: { applicationId, contentType },
  });
  if (error) throw await edgeFunctionError(error, "The logo upload could not be prepared.");
  if (!data?.path || !data?.token) throw new Error("The logo upload could not be prepared.");
  return { path: String(data.path), token: String(data.token) };
}

export async function beginEventPartnershipPayment(applicationId: string, phoneNumber: string): Promise<PartnershipPaymentStatus> {
  const { data, error } = await db().functions.invoke("initiate-event-partnership-payment", {
    body: { applicationId, phoneNumber },
  });
  if (error) throw await edgeFunctionError(error, "M-Pesa could not be started. Check the number and try again.");
  if (!data?.status || !data?.applicationId) throw new Error("M-Pesa could not be started. Please try again.");
  return data as PartnershipPaymentStatus;
}

export async function checkEventPartnershipPayment(applicationId: string): Promise<PartnershipPaymentStatus> {
  const { data, error } = await db().functions.invoke("check-event-partnership-payment", {
    body: { applicationId },
  });
  if (error) throw await edgeFunctionError(error, "We are still waiting for M-Pesa confirmation.");
  if (!data?.status || !data?.applicationId) throw new Error("We are still waiting for M-Pesa confirmation.");
  return data as PartnershipPaymentStatus;
}

export async function listAdminEventPartnershipEvents(): Promise<EventPartnershipAdminEventRow[]> {
  const { data, error } = await db().rpc("admin_list_event_partnership_events");
  if (error) throw error;
  return (data ?? []) as EventPartnershipAdminEventRow[];
}

export async function listAdminEventPartnershipPackages(eventId: string): Promise<EventPartnershipPackageRow[]> {
  const { data, error } = await db().rpc("admin_list_event_partnership_packages", { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []) as EventPartnershipPackageRow[];
}

export interface SaveEventPartnershipPackageInput {
  id: string | null;
  eventId: string;
  category: string;
  name: string;
  serviceDescription: string;
  priceKes: number;
  sortOrder: number;
  isActive: boolean;
}

export async function saveEventPartnershipPackage(input: SaveEventPartnershipPackageInput): Promise<void> {
  const { error } = await db().rpc("admin_save_event_partnership_package", {
    p_package_id: input.id,
    p_event_id: input.eventId,
    p_category: input.category,
    p_name: input.name,
    p_service_description: input.serviceDescription,
    p_price_kes: input.priceKes,
    p_sort_order: input.sortOrder,
    p_is_active: input.isActive,
  });
  if (error) throw error;
}

export async function listAdminEventPartnershipApplications(eventId: string | null): Promise<EventPartnershipAdminApplicationRow[]> {
  const { data, error } = await db().rpc("admin_list_event_partnership_applications", { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []) as EventPartnershipAdminApplicationRow[];
}

export async function setEventPartnershipPublic(applicationId: string, isPublic: boolean): Promise<void> {
  const { error } = await db().rpc("admin_set_event_partnership_public", {
    p_application_id: applicationId,
    p_is_public: isPublic,
  });
  if (error) throw error;
}
