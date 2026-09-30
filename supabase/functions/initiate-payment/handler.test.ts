import { handleInitiatePayment } from "./handler.ts";
import type { DbClient, OrderRow, PaymentRow } from "../_shared/dbClient.ts";

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg ?? `Assertion failed: expected ${b}, got ${a}`);
}

class FakeDb implements DbClient {
  order: OrderRow;
  payments: PaymentRow[] = [];
  confirmed: string[] = [];
  failed: string[] = [];

  constructor(order: OrderRow) {
    this.order = order;
  }

  async getOrder(orderId: string) {
    return this.order.id === orderId ? this.order : null;
  }
  async recordPaymentInitiation(orderId: string, provider: string, providerReference: string, _amountMinor: number) {
    const payment: PaymentRow = { id: `payment-${this.payments.length + 1}`, order_id: orderId, provider, provider_reference: providerReference, status: "initiated" };
    this.payments.push(payment);
    this.order = { ...this.order, status: "awaiting_payment" };
    return payment;
  }
  async confirmPayment(paymentId: string) {
    this.confirmed.push(paymentId);
    this.order = { ...this.order, status: "paid" };
    return { orderId: this.order.id, ticketsIssued: 2 };
  }
  async failPayment(paymentId: string, _reason: string) {
    this.failed.push(paymentId);
    this.order = { ...this.order, status: "failed" };
  }
  async findPaymentByProviderReference(provider: string, providerReference: string) {
    return this.payments.find((p) => p.provider === provider && p.provider_reference === providerReference) ?? null;
  }
  async recordWebhookEventIfNew() {
    return true;
  }
}

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return { id: "order-1", reference: "AT-ABC123", status: "pending", total_minor: 50000, currency: "KES", ...overrides };
}

function makeMpesaAdapter() {
  return {
    name: "mpesa",
    async initiate() {
      return { providerReference: "ws_CO_test", status: "pending" as const, resolvedImmediately: false, raw: {} };
    },
    async query() {
      return { providerReference: "ws_CO_test", status: "pending" as const, raw: {} };
    },
    async verifyCallback() {
      throw new Error("unused in this test");
    },
    async refund() {
      throw new Error("unused in this test");
    },
  };
}

Deno.test("initiate-payment: production M-Pesa-shaped provider returns pending without confirming", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254712345678" }) });

  const res = await handleInitiatePayment(req, { db, adapter: makeMpesaAdapter() });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.status, "pending");
  assertEquals(db.confirmed.length, 0);
  assertEquals(db.order.status, "awaiting_payment");
});

Deno.test("initiate-payment: rejects an order that is already paid", async () => {
  const db = new FakeDb(makeOrder({ status: "paid" }));
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254712345678" }) });

  const res = await handleInitiatePayment(req, { db, adapter: makeMpesaAdapter() });
  assertEquals(res.status, 409);
  assertEquals(db.payments.length, 0);
});

Deno.test("initiate-payment: 404 for an order that does not exist", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "does-not-exist" }) });
  const res = await handleInitiatePayment(req, { db, adapter: makeMpesaAdapter() });
  assertEquals(res.status, 404);
});

Deno.test("initiate-payment: 400 for missing orderId", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({}) });
  const res = await handleInitiatePayment(req, { db, adapter: makeMpesaAdapter() });
  assertEquals(res.status, 400);
});
