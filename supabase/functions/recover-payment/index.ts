import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import { handleRecoverPayment, type RecoveryPayment } from "./handler.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.startsWith("replace-with-") || value.includes("<")) throw new Error(`missing production payment secret: ${name}`);
  return value;
}

function loadAdapter() {
  return new MpesaPaymentAdapter({
    consumerKey: requiredEnv("MPESA_CONSUMER_KEY"),
    consumerSecret: requiredEnv("MPESA_CONSUMER_SECRET"),
    shortcode: requiredEnv("MPESA_SHORTCODE"),
    tillNumber: requiredEnv("MPESA_TILL_NUMBER"),
    passkey: requiredEnv("MPESA_PASSKEY"),
    baseUrl: requiredEnv("MPESA_BASE_URL"),
    callbackUrl: requiredEnv("MPESA_CALLBACK_URL"),
    webhookSecret: requiredEnv("MPESA_WEBHOOK_SECRET"),
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const service = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "authentication required" }, 401);
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "authentication required" }, 401);

    const db = {
      async findByReference(reference: string): Promise<RecoveryPayment | null> {
        const paymentSelect = "id,order_id,provider,provider_reference,mpesa_receipt_number,amount_minor,status,orders!inner(id,reference,buyer_id,buyer_email,status)";
        const byProvider = await service.from("payments").select(paymentSelect).eq("provider", "mpesa").eq("provider_reference", reference).maybeSingle();
        if (byProvider.error) throw byProvider.error;
        const byReceipt = byProvider.data ? byProvider : await service.from("payments").select(paymentSelect).eq("provider", "mpesa").eq("mpesa_receipt_number", reference).maybeSingle();
        if (byReceipt.error) throw byReceipt.error;
        let row = byReceipt.data as any;
        if (!row) {
          const order = await service.from("orders").select("id,reference,buyer_id,buyer_email,status").eq("reference", reference).maybeSingle();
          if (order.error) throw order.error;
          if (!order.data) return null;
          const payment = await service.from("payments").select(paymentSelect).eq("order_id", order.data.id).eq("provider", "mpesa").order("initiated_at", { ascending: false }).limit(1).maybeSingle();
          if (payment.error) throw payment.error;
          row = payment.data as any;
        }
        if (!row) return null;
        const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
        return {
          id: row.id,
          orderId: row.order_id,
          provider: row.provider,
          providerReference: row.provider_reference,
          paymentStatus: row.status,
          orderStatus: order?.status,
          amountMinor: Number(row.amount_minor),
          buyerId: order?.buyer_id ?? null,
          buyerEmail: order?.buyer_email ?? null,
        };
      },
      async listBuyerPending(userId: string, email?: string | null) {
        const orders = await service.from("orders").select("id").eq("buyer_id", userId).in("status", ["pending", "awaiting_payment"]);
        if (orders.error) throw orders.error;
        const ids = (orders.data ?? []).map((row) => row.id);
        if (!ids.length) return [];
        const payments = await service.from("payments").select("id,order_id,provider,provider_reference,mpesa_receipt_number,amount_minor,status,orders!inner(id,reference,buyer_id,buyer_email,status)").in("order_id", ids).eq("provider", "mpesa").in("status", ["initiated", "pending"]);
        if (payments.error) throw payments.error;
        return (payments.data ?? []).map((row: any) => ({
          id: row.id, orderId: row.order_id, provider: row.provider, providerReference: row.provider_reference,
          paymentStatus: row.status, amountMinor: Number(row.amount_minor),
          orderStatus: row.orders?.status, buyerId: row.orders?.buyer_id ?? null, buyerEmail: row.orders?.buyer_email ?? email ?? null,
        }));
      },
      async confirmPayment(paymentId: string) {
        const { data, error } = await service.rpc("confirm_payment_and_issue_tickets", { p_payment_id: paymentId }).single();
        if (error) throw error;
        return { orderId: data.order_id, ticketsIssued: data.tickets_issued };
      },
      async failPayment(paymentId: string, reason: string) {
        const { error } = await service.rpc("fail_payment", { p_payment_id: paymentId, p_reason: reason });
        if (error) throw error;
      },
    };
    return await handleRecoverPayment(req, { db, adapter: loadAdapter(), userId: user.id, userEmail: user.email });
  } catch (error) {
    console.error("recover_payment_failed", error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: "payment recovery is temporarily unavailable" }, 503);
  }
});
