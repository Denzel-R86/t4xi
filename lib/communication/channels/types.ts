/**
 * Kanaalcontract. Elk kanaal krijgt een al gerenderd bericht en zegt alleen of
 * de aflevering bij de provider is gelukt. Templates, policies en logging zitten
 * er bewust niet in: een kanaal weet niet waarom het iets verstuurt.
 */

import type { ChannelId } from "@/lib/communication/policies/channel";
import type { FailureKind } from "@/lib/communication/policies/retry";

export type OutboundMessage = {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string }>;
  /** Wordt als provider-idempotency doorgegeven; gelijk aan de dedup-sleutel. */
  idempotencyKey: string;
};

export type ChannelResult =
  | { ok: true; provider: string; providerMessageId: string | null }
  | { ok: false; provider: string; error: string; failure: FailureKind };

export type Channel = {
  id: ChannelId;
  provider: string;
  send(message: OutboundMessage): Promise<ChannelResult>;
};
