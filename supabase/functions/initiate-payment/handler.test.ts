import { handleInitiatePayment } from "./handler.ts";
import { MockPaymentAdapter } from "../_shared/mockPaymentProvider.ts";
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
  return { id: "order-1", reference: "TY-ABC123", status: "pending", total_minor: 50000, currency: "KES", ...overrides };
}

Deno.test("initiate-payment: mock success resolves the order immediately", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254712345678" }) });

  const res = await handleInitiatePayment(req, { db, adapter: new MockPaymentAdapter() });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.status, "succeeded");
  assertEquals(db.confirmed.length, 1);
  assertEquals(db.order.status, "paid");
});

Deno.test("initiate-payment: mock failure (phone ending in 00) releases via failPayment", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254700000000" }) });

  const res = await handleInitiatePayment(req, { db, adapter: new MockPaymentAdapter() });
  const body = await res.json();

  assertEquals(res.status, 402);
  assertEquals(body.status, "failed");
  assertEquals(db.failed.length, 1);
  assertEquals(db.order.status, "failed");
});

Deno.test("initiate-payment: rejects an order that's already paid", async () => {
  const db = new FakeDb(makeOrder({ status: "paid" }));
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254712345678" }) });

  const res = await handleInitiatePayment(req, { db, adapter: new MockPaymentAdapter() });
  assertEquals(res.status, 409);
  assertEquals(db.payments.length, 0); // never even called the provider
});

Deno.test("initiate-payment: 404 for an order that doesn't exist", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "does-not-exist" }) });
  const res = await handleInitiatePayment(req, { db, adapter: new MockPaymentAdapter() });
  assertEquals(res.status, 404);
});

Deno.test("initiate-payment: 400 for missing orderId", async () => {
  const db = new FakeDb(makeOrder());
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({}) });
  const res = await handleInitiatePayment(req, { db, adapter: new MockPaymentAdapter() });
  assertEquals(res.status, 400);
});

Deno.test("initiate-payment: async provider (mpesa-shaped) returns pending without confirming", async () => {
  const db = new FakeDb(makeOrder());
  const asyncAdapter = {
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
  const req = new Request("http://x/initiate-payment", { method: "POST", body: JSON.stringify({ orderId: "order-1", phoneNumber: "254712345678" }) });
  const res = await handleInitiatePayment(req, { db, adapter: asyncAdapter });
  const body = await res.json();

  assertEquals(body.status, "pending");
  assertEquals(db.confirmed.length, 0);
  assertEquals(db.order.status, "awaiting_payment");
});
