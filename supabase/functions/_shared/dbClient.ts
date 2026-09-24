export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  total_minor: number;
  currency: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_reference: string;
  status: string;
}

export interface DbClient {
  getOrder(orderId: string): Promise<OrderRow | null>;
  recordPaymentInitiation(orderId: string, provider: string, providerReference: string, amountMinor: number): Promise<PaymentRow>;
  confirmPayment(paymentId: string): Promise<{ orderId: string; ticketsIssued: number }>;
  failPayment(paymentId: string, reason: string): Promise<void>;
  findPaymentByProviderReference(provider: string, providerReference: string): Promise<PaymentRow | null>;
  /** Returns false if this exact provider event was already recorded (dedupe). */
  recordWebhookEventIfNew(provider: string, providerEventId: string, payload: unknown): Promise<boolean>;
}

/**
 * Real implementation used in production, backed by the service role key
 * (never the anon key — these calls hit functions that are deliberately
 * revoked from anon/authenticated in migration 0010).
 *
 * `createClient` is passed in rather than imported here so this file has
 * zero Deno/npm-specific syntax and can be type-checked or unit tested
 * anywhere. The real caller (index.ts) imports it via:
 *   import { createClient } from "npm:@supabase/supabase-js@2";
 */
export function createSupabaseDbClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  // deno-lint-ignore no-explicit-any
  createClient: (url: string, key: string) => any
): DbClient {
  const client = createClient(supabaseUrl, serviceRoleKey);

  return {
    async getOrder(orderId) {
      const { data, error } = await client.from("orders").select("id, reference, status, total_minor, currency").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async recordPaymentInitiation(orderId, provider, providerReference, amountMinor) {
      const { data, error } = await client
        .rpc("record_payment_initiation", { p_order_id: orderId, p_provider: provider, p_provider_reference: providerReference, p_amount_minor: amountMinor })
        .single();
      if (error) throw error;
      return data;
    },
    async confirmPayment(paymentId) {
      const { data, error } = await client.rpc("confirm_payment_and_issue_tickets", { p_payment_id: paymentId }).single();
      if (error) throw error;
      return { orderId: data.order_id, ticketsIssued: data.tickets_issued };
    },
    async failPayment(paymentId, reason) {
      const { error } = await client.rpc("fail_payment", { p_payment_id: paymentId, p_reason: reason });
      if (error) throw error;
    },
    async findPaymentByProviderReference(provider, providerReference) {
      const { data, error } = await client
        .from("payments")
        .select("id, order_id, provider, provider_reference, status")
        .eq("provider", provider)
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async recordWebhookEventIfNew(provider, providerEventId, payload) {
      const { error } = await client
        .from("payment_webhook_events")
        .insert({ provider, provider_event_id: providerEventId, payload });
      // Unique violation (23505) means we've already recorded this exact
      // callback delivery — that's the dedupe signal, not a real error.
      if (error) {
        if (error.code === "23505") return false;
        throw error;
      }
      return true;
    },
  };
}
