import { handleMpesaWebhook } from "./handler.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import type { DbClient, PaymentRow } from "../_shared/dbClient.ts";

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg ?? `Assertion failed: expected ${b}, got ${a}`);
}

class FakeDb implements DbClient {
  payments: PaymentRow[];
  seenEvents = new Set<string>();
  confirmed: string[] = [];
  failed: Array<{ id: string; reason: string }> = [];

  constructor(payments: PaymentRow[]) {
    this.payments = payments;
  }

  async getOrder() {
    return null;
  }
  async recordPaymentInitiation(): Promise<PaymentRow> {
    throw new Error("unused");
  }
  async confirmPayment(paymentId: string) {
    this.confirmed.push(paymentId);
    return { orderId: "order-1", ticketsIssued: 2 };
  }
  async failPayment(paymentId: string, reason: string) {
    this.failed.push({ id: paymentId, reason });
  }
  async findPaymentByProviderReference(provider: string, providerReference: string) {
    return this.payments.find((p) => p.provider === provider && p.provider_reference === providerReference) ?? null;
  }
  async recordWebhookEventIfNew(_provider: string, providerEventId: string) {
    if (this.seenEvents.has(providerEventId)) return false;
    this.seenEvents.add(providerEventId);
    return true;
  }
}

const config = {
  consumerKey: "k", consumerSecret: "s", shortcode: "174379", passkey: "p",
  baseUrl: "http://unused", callbackUrl: "https://x/functions/v1/mpesa-webhook/whsec_test", webhookSecret: "whsec_test",
};

function successBody(checkoutRequestId: string, merchantRequestId = "merchant-1") {
  return JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: { Item: [{ Name: "Amount", Value: 1500 }, { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" }] },
      },
    },
  });
}

function failureBody(checkoutRequestId: string, merchantRequestId = "merchant-2") {
  return JSON.stringify({
    Body: { stkCallback: { MerchantRequestID: merchantRequestId, CheckoutRequestID: checkoutRequestId, ResultCode: 1032, ResultDesc: "Cancelled by user" } },
  });
}

function req(body: string, secret = "whsec_test") {
  return new Request(`https://x/functions/v1/mpesa-webhook/${secret}`, { method: "POST", body });
}

Deno.test("webhook: successful payment confirms and issues tickets", async () => {
  const db = new FakeDb([{ id: "payment-1", order_id: "order-1", provider: "mpesa", provider_reference: "ws_CO_1", status: "initiated" }]);
  const res = await handleMpesaWebhook(req(successBody("ws_CO_1")), { db, adapter: new MpesaPaymentAdapter(config) });
  assertEquals(res.status, 200);
  assertEquals(db.confirmed, ["payment-1"]);
});

Deno.test("webhook: failed/cancelled payment releases the hold via failPayment", async () => {
  const db = new FakeDb([{ id: "payment-2", order_id: "order-2", provider: "mpesa", provider_reference: "ws_CO_2", status: "initiated" }]);
  const res = await handleMpesaWebhook(req(failureBody("ws_CO_2")), { db, adapter: new MpesaPaymentAdapter(config) });
  assertEquals(res.status, 200);
  assertEquals(db.failed.length, 1);
  assertEquals(db.failed[0].id, "payment-2");
  assertEquals(db.confirmed.length, 0);
});

Deno.test("webhook: duplicate delivery of the same callback is a no-op the second time", async () => {
  const db = new FakeDb([{ id: "payment-3", order_id: "order-3", provider: "mpesa", provider_reference: "ws_CO_3", status: "initiated" }]);
  const adapter = new MpesaPaymentAdapter(config);
  const body = successBody("ws_CO_3", "merchant-dup");

  const first = await handleMpesaWebhook(req(body), { db, adapter });
  const second = await handleMpesaWebhook(req(body), { db, adapter });

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(db.confirmed.length, 1, "confirmPayment must only be called once across both deliveries");
});

Deno.test("webhook: wrong shared secret is rejected before touching the DB", async () => {
  const db = new FakeDb([{ id: "payment-4", order_id: "order-4", provider: "mpesa", provider_reference: "ws_CO_4", status: "initiated" }]);
  const res = await handleMpesaWebhook(req(successBody("ws_CO_4"), "WRONG_SECRET"), { db, adapter: new MpesaPaymentAdapter(config) });
  assertEquals(res.status, 401);
  assertEquals(db.confirmed.length, 0);
  assertEquals(db.seenEvents.size, 0, "must not record the webhook event when the secret is wrong");
});

Deno.test("webhook: callback for an unknown providerReference is acked but not processed", async () => {
  const db = new FakeDb([]); // no payments at all
  const res = await handleMpesaWebhook(req(successBody("ws_CO_UNKNOWN")), { db, adapter: new MpesaPaymentAdapter(config) });
  assertEquals(res.status, 200); // still ack, so Daraja doesn't retry forever
  assertEquals(db.confirmed.length, 0);
});

Deno.test("webhook: malformed body returns 400", async () => {
  const db = new FakeDb([]);
  const res = await handleMpesaWebhook(req("not json"), { db, adapter: new MpesaPaymentAdapter(config) });
  assertEquals(res.status, 400);
});
