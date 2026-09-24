// The contract every payment provider implements. An Edge Function talks
// to this interface only — never to a provider's SDK/HTTP API directly —
// so switching or adding a provider never touches checkout, webhook
// routing, or order logic.

export type PaymentOutcomeStatus = "pending" | "succeeded" | "failed";

export interface InitiateParams {
  orderId: string;
  orderReference: string;
  amountMinor: number;
  currency: "KES";
  /** MSISDN in 2547XXXXXXXX format for STK push providers; unused by others. */
  phoneNumber?: string;
}

export interface InitiateResult {
  /** The provider's own reference for this payment attempt — what webhooks/queries key off. */
  providerReference: string;
  status: PaymentOutcomeStatus;
  /** Present when a provider resolves synchronously (e.g. the mock adapter) rather than via webhook. */
  resolvedImmediately: boolean;
  raw: unknown;
}

export interface QueryResult {
  providerReference: string;
  status: PaymentOutcomeStatus;
  raw: unknown;
}

export interface CallbackVerification {
  /** True if the callback's signature/token/shared-secret checks out. */
  isAuthentic: boolean;
  /** A stable id used to deduplicate this exact callback delivery. */
  providerEventId: string;
  providerReference: string;
  status: PaymentOutcomeStatus;
  failureReason?: string;
}

export interface RefundResult {
  providerReference: string;
  status: "sent" | "failed";
  raw: unknown;
}

export interface PaymentAdapter {
  readonly name: string;
  initiate(params: InitiateParams): Promise<InitiateResult>;
  query(providerReference: string): Promise<QueryResult>;
  /** Parses + authenticates an inbound webhook request. Never trust a callback without this. */
  verifyCallback(req: Request, rawBody: string): Promise<CallbackVerification>;
  refund(providerReference: string, amountMinor: number): Promise<RefundResult>;
}
