import type { CallbackVerification, InitiateParams, InitiateResult, PaymentAdapter, QueryResult, RefundResult } from "./paymentAdapter.ts";

/**
 * Deterministic by design: a phone number ending in "00" always fails,
 * everything else succeeds. This is what the playbook calls for — "a
 * second mock adapter for deterministic tests" — not a random/flaky
 * simulator. resolvedImmediately = true tells the caller there's no
 * webhook coming, so it should confirm/fail the payment right away.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = "mock";

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const willFail = (params.phoneNumber ?? "").endsWith("00");
    const providerReference = `MOCK-${params.orderReference}-${Date.now()}`;
    return {
      providerReference,
      status: willFail ? "failed" : "succeeded",
      resolvedImmediately: true,
      raw: { simulated: true, phoneNumber: params.phoneNumber, willFail },
    };
  }

  async query(providerReference: string): Promise<QueryResult> {
    return { providerReference, status: "succeeded", raw: { simulated: true } };
  }

  async verifyCallback(_req: Request, rawBody: string): Promise<CallbackVerification> {
    const body = JSON.parse(rawBody);
    return {
      isAuthentic: true,
      providerEventId: body.eventId ?? crypto.randomUUID(),
      providerReference: body.providerReference,
      status: body.status ?? "succeeded",
    };
  }

  async refund(providerReference: string, _amountMinor: number): Promise<RefundResult> {
    return { providerReference, status: "sent", raw: { simulated: true } };
  }
}
