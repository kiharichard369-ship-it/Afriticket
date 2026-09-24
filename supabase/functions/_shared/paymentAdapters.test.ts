import { MockPaymentAdapter } from "./mockPaymentProvider.ts";
import { MpesaPaymentAdapter } from "./mpesaProvider.ts";

function assertEquals<T>(actual: T, expected: T) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`Assertion failed: expected ${b}, got ${a}`);
}

async function assertRejects(fn: () => Promise<unknown>) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected function to reject/throw");
}

// ── Mock adapter ────────────────────────────────────────────────────────

Deno.test("mock adapter: succeeds for a normal phone number", async () => {
  const adapter = new MockPaymentAdapter();
  const result = await adapter.initiate({
    orderId: "order-1",
    orderReference: "TY-ABC123",
    amountMinor: 50000,
    currency: "KES",
    phoneNumber: "254712345678",
  });
  assertEquals(result.status, "succeeded");
  assertEquals(result.resolvedImmediately, true);
});

Deno.test("mock adapter: fails deterministically for a phone number ending in 00", async () => {
  const adapter = new MockPaymentAdapter();
  const result = await adapter.initiate({
    orderId: "order-2",
    orderReference: "TY-DEF456",
    amountMinor: 50000,
    currency: "KES",
    phoneNumber: "254712345600",
  });
  assertEquals(result.status, "failed");
});

// ── M-Pesa adapter, against a fake local Daraja server ───────────────────

function startFakeDaraja(opts: { stkResponseCode?: string; queryResultCode?: number } = {}) {
  const { stkResponseCode = "0", queryResultCode = 0 } = opts;
  const received: { path: string; auth: string | null; body: unknown }[] = [];

  const server = Deno.serve({ port: 0 }, async (req) => {
    const url = new URL(req.url);
    const auth = req.headers.get("Authorization");
    if (url.pathname === "/oauth/v1/generate") {
      received.push({ path: url.pathname, auth, body: null });
      return Response.json({ access_token: "fake-token", expires_in: "3599" });
    }
    if (url.pathname === "/mpesa/stkpush/v1/processrequest") {
      const body = await req.json();
      received.push({ path: url.pathname, auth, body });
      if (stkResponseCode !== "0") {
        return Response.json({ ResponseCode: stkResponseCode, ResponseDescription: "Rejected by test" });
      }
      return Response.json({
        MerchantRequestID: "merchant-123",
        CheckoutRequestID: "ws_CO_test_456",
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: "Success. Request accepted for processing",
      });
    }
    if (url.pathname === "/mpesa/stkpushquery/v1/query") {
      const body = await req.json();
      received.push({ path: url.pathname, auth, body });
      return Response.json({ ResultCode: queryResultCode, ResultDesc: queryResultCode === 0 ? "Success" : "Failed" });
    }
    return new Response("not found", { status: 404 });
  });

  return { server, received, baseUrl: `http://localhost:${(server.addr as Deno.NetAddr).port}` };
}

function testConfig(baseUrl: string) {
  return {
    consumerKey: "test-key",
    consumerSecret: "test-secret",
    shortcode: "174379",
    passkey: "test-passkey",
    baseUrl,
    callbackUrl: "https://example.supabase.co/functions/v1/mpesa-webhook/whsec_test123",
    webhookSecret: "whsec_test123",
  };
}

Deno.test("mpesa adapter: initiate() calls oauth then STK push and returns CheckoutRequestID", async () => {
  const { server, received, baseUrl } = startFakeDaraja();
  try {
    const adapter = new MpesaPaymentAdapter(testConfig(baseUrl));
    const result = await adapter.initiate({
      orderId: "order-1",
      orderReference: "TY-ABC123",
      amountMinor: 150000,
      currency: "KES",
      phoneNumber: "254712345678",
    });

    assertEquals(result.status, "pending");
    assertEquals(result.resolvedImmediately, false);
    assertEquals(result.providerReference, "ws_CO_test_456");
    assertEquals(received.length, 2);
    assertEquals(received[0].path, "/oauth/v1/generate");
    assertEquals(received[1].path, "/mpesa/stkpush/v1/processrequest");
    // Amount must be converted from minor units (cents) to whole KES.
    assertEquals((received[1].body as { Amount: number }).Amount, 1500);
    assertEquals((received[1].body as { PhoneNumber: string }).PhoneNumber, "254712345678");
  } finally {
    await server.shutdown();
  }
});

Deno.test("mpesa adapter: initiate() throws when Daraja rejects the STK push", async () => {
  const { server, baseUrl } = startFakeDaraja({ stkResponseCode: "1" });
  try {
    const adapter = new MpesaPaymentAdapter(testConfig(baseUrl));
    await assertRejects(() =>
      adapter.initiate({
        orderId: "order-1",
        orderReference: "TY-ABC123",
        amountMinor: 150000,
        currency: "KES",
        phoneNumber: "254712345678",
      })
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test("mpesa adapter: query() reflects Daraja's ResultCode", async () => {
  const { server, baseUrl } = startFakeDaraja({ queryResultCode: 0 });
  try {
    const adapter = new MpesaPaymentAdapter(testConfig(baseUrl));
    const result = await adapter.query("ws_CO_test_456");
    assertEquals(result.status, "succeeded");
  } finally {
    await server.shutdown();
  }
});

Deno.test("mpesa adapter: verifyCallback accepts a matching webhook secret and parses a successful callback", async () => {
  const adapter = new MpesaPaymentAdapter(testConfig("http://unused"));
  const body = JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: "merchant-123",
        CheckoutRequestID: "ws_CO_test_456",
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 1500 },
            { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  });
  const req = new Request("https://example.supabase.co/functions/v1/mpesa-webhook/whsec_test123", { method: "POST", body });
  const result = await adapter.verifyCallback(req, body);

  assertEquals(result.isAuthentic, true);
  assertEquals(result.status, "succeeded");
  assertEquals(result.providerReference, "ws_CO_test_456");
  assertEquals(result.providerEventId, "merchant-123:ws_CO_test_456");
});

Deno.test("mpesa adapter: verifyCallback rejects a wrong webhook secret", async () => {
  const adapter = new MpesaPaymentAdapter(testConfig("http://unused"));
  const body = JSON.stringify({
    Body: { stkCallback: { MerchantRequestID: "m", CheckoutRequestID: "c", ResultCode: 0 } },
  });
  const req = new Request("https://example.supabase.co/functions/v1/mpesa-webhook/WRONG_SECRET", { method: "POST", body });
  const result = await adapter.verifyCallback(req, body);
  assertEquals(result.isAuthentic, false);
});

Deno.test("mpesa adapter: verifyCallback parses a failed/cancelled callback (no CallbackMetadata)", async () => {
  const adapter = new MpesaPaymentAdapter(testConfig("http://unused"));
  const body = JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: "merchant-999",
        CheckoutRequestID: "ws_CO_test_999",
        ResultCode: 1032,
        ResultDesc: "Request cancelled by user",
      },
    },
  });
  const req = new Request("https://example.supabase.co/functions/v1/mpesa-webhook/whsec_test123", { method: "POST", body });
  const result = await adapter.verifyCallback(req, body);

  assertEquals(result.isAuthentic, true);
  assertEquals(result.status, "failed");
  assertEquals(result.failureReason, "Request cancelled by user");
});
