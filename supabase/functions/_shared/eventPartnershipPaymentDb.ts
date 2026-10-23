// Location: supabase/functions/_shared/eventPartnershipPaymentDb.ts
// Service-role database operations for event partnership payments; deliberately separate from ticket orders.

export interface EventPartnershipPaymentRow {
  id: string;
  application_id: string;
  provider: string;
  provider_reference: string | null;
  amount_minor: number;
  status: "initiated" | "pending" | "succeeded" | "failed";
  mpesa_receipt_number?: string | null;
}

export interface EventPartnershipApplicationRow {
  id: string;
  public_reference: string;
  status: "awaiting_payment" | "paid" | "cancelled";
  amount_minor_snapshot: number;
  contact_phone: string;
}

export interface EventPartnershipPaymentDb {
  getApplication(applicationId: string): Promise<EventPartnershipApplicationRow | null>;
  reservePaymentAttempt(applicationId: string): Promise<EventPartnershipPaymentRow>;
  recordPaymentInitiation(paymentId: string, providerReference: string): Promise<void>;
  failPayment(paymentId: string, reason: string): Promise<void>;
  findPaymentByProviderReference(providerReference: string): Promise<EventPartnershipPaymentRow | null>;
  findLatestPayment(applicationId: string): Promise<EventPartnershipPaymentRow | null>;
  confirmPayment(paymentId: string, receipt?: string, reportedAmountMinor?: number): Promise<string>;
  recordWebhookEventIfNew(providerEventId: string, payload: unknown): Promise<boolean>;
  checkRateLimit(bucket: string, maximum: number, window: string): Promise<boolean>;
}

/**
 * Real implementation backed by SUPABASE_SERVICE_ROLE_KEY. The injected
 * createClient keeps this module independently testable outside Deno.
 */
export function createEventPartnershipPaymentDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  // deno-lint-ignore no-explicit-any
  createClient: (url: string, key: string) => any,
): EventPartnershipPaymentDb {
  const client = createClient(supabaseUrl, serviceRoleKey);

  return {
    async getApplication(applicationId) {
      const { data, error } = await client
        .from("event_partnership_applications")
        .select("id, public_reference, status, amount_minor_snapshot, contact_phone")
        .eq("id", applicationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async reservePaymentAttempt(applicationId) {
      const { data, error } = await client
        .rpc("create_event_partnership_payment_attempt", { p_application_id: applicationId })
        .single();
      if (error) throw error;
      return data as EventPartnershipPaymentRow;
    },
    async recordPaymentInitiation(paymentId, providerReference) {
      const { error } = await client.rpc("record_event_partnership_payment_initiation", {
        p_payment_id: paymentId,
        p_provider_reference: providerReference,
      });
      if (error) throw error;
    },
    async failPayment(paymentId, reason) {
      const { error } = await client.rpc("fail_event_partnership_payment", {
        p_payment_id: paymentId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    async findPaymentByProviderReference(providerReference) {
      const { data, error } = await client
        .from("event_partnership_payments")
        .select("id, application_id, provider, provider_reference, amount_minor, status, mpesa_receipt_number")
        .eq("provider", "mpesa")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async findLatestPayment(applicationId) {
      const { data, error } = await client
        .from("event_partnership_payments")
        .select("id, application_id, provider, provider_reference, amount_minor, status, mpesa_receipt_number")
        .eq("application_id", applicationId)
        .order("initiated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async confirmPayment(paymentId, receipt, reportedAmountMinor) {
      const { data, error } = await client.rpc("confirm_event_partnership_payment", {
        p_payment_id: paymentId,
        p_receipt: receipt ?? null,
        p_reported_amount_minor: reportedAmountMinor ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    async recordWebhookEventIfNew(providerEventId, payload) {
      const { error } = await client
        .from("payment_webhook_events")
        .insert({ provider: "mpesa", provider_event_id: providerEventId, payload });
      if (error) {
        if (error.code === "23505") return false;
        throw error;
      }
      return true;
    },
    async checkRateLimit(bucket, maximum, window) {
      const { data, error } = await client.rpc("check_rate_limit", {
        p_bucket: bucket,
        p_max_events: maximum,
        p_window: window,
      });
      if (error) throw error;
      return Boolean(data);
    },
  };
}
