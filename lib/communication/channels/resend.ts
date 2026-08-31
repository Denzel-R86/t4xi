/**
 * Resend-transport — de enige plek die de Resend-API kent.
 *
 * Verving drie losse `fetch`-aanroepen (boeking, lead, factuur) die elk hun
 * eigen payload, timeout en foutafhandeling hadden. Het verzonden bericht is
 * hetzelfde; wat verandert is dat alles nu één tijdslimiet, één foutclassificatie
 * en één plek voor het provider-message-id heeft.
 *
 * Server-only: leest `RESEND_API_KEY`, dat nooit naar de client mag.
 */

import { fromAddress } from "@/lib/communication/templates/brand";
import type { Channel, ChannelResult, OutboundMessage } from "@/lib/communication/channels/types";
import { classifyError, classifyHttpStatus } from "@/lib/communication/policies/retry";
import type { ChannelId } from "@/lib/communication/policies/channel";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const PROVIDER = "resend";

async function post(message: OutboundMessage): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, provider: PROVIDER, error: "not_configured", failure: "unknown" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: message.to,
        // De REST-API verwacht snake_case; camelCase wordt stil genegeerd.
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        provider: PROVIDER,
        error: `resend_${response.status}: ${body.slice(0, 200)}`,
        failure: classifyHttpStatus(response.status),
      };
    }

    // Het message-id koppelt latere webhook-events (delivered/bounced) aan deze
    // regel. Ontbreekt het, dan blijft de verzending geslaagd — alleen de
    // statusopvolging is dan blind.
    const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof payload?.id === "string" ? payload.id : null;
    return { ok: true, provider: PROVIDER, providerMessageId: id };
  } catch (error) {
    return {
      ok: false,
      provider: PROVIDER,
      error: error instanceof Error ? error.message : "send_failed",
      failure: classifyError(error),
    };
  }
}

function resendChannel(id: ChannelId): Channel {
  return { id, provider: PROVIDER, send: post };
}

/**
 * `email` gaat naar de klant, `internal` naar operations. Zelfde transport,
 * bewust verschillende kanaal-id's: policy en log moeten die twee kunnen
 * onderscheiden, ook wanneer intern later naar een ander medium verhuist.
 */
export const emailChannel = resendChannel("email");
export const internalChannel = resendChannel("internal");
