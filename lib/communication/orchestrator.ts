/**
 * Communication Orchestrator — de enige route van domeinevent naar bericht.
 *
 *   domeinevent → policy (taal, kanaal, dedup) → template → kanaal → log
 *
 * API-routes, Stripe-webhooks en dashboardacties roepen geen templates meer
 * rechtstreeks aan; ze publiceren een event. Daardoor zit kanaalkeuze,
 * taalkeuze en deduplicatie op één plek in plaats van verspreid over de code.
 *
 * Faalt nooit hard: elke uitkomst wordt teruggegeven, nooit gegooid. Een
 * boeking of aanvraag mag niet stukgaan omdat een mailprovider hapert.
 */

import type { Audience, CommunicationEvent } from "@/lib/communication/events";
import { channelFor } from "@/lib/communication/channels";
import { channelsFor, isChannelActive, type ChannelId } from "@/lib/communication/policies/channel";
import { dedupKey, duplicatesArePossible } from "@/lib/communication/policies/dedup";
import { resolveLocale } from "@/lib/communication/policies/language";
import { operationsGatesCustomer } from "@/lib/communication/policies/ordering";
import { renderTemplate } from "@/lib/communication/templates/registry";
import type { RenderedMessage } from "@/lib/communication/templates/registry";
import {
  unloggedDeliveryLog,
  type ClaimInput,
  type DeliveryLog,
  type SettleInput,
} from "@/lib/communication/delivery-log";
import { operationalAlert } from "@/lib/communication/alerting";
import { checkRecipients } from "@/lib/communication/policies/recipients";

export type OutcomeStatus = "sent" | "duplicate" | "skipped" | "failed" | "blocked";

export type DispatchOutcome = {
  audience: Audience;
  channel: ChannelId;
  templateId: string | null;
  /**
   * Is deze verzending vastgelegd in het communicatielog? `false` betekent dat
   * het bericht wél uitging maar onzichtbaar bleef — observability is een eigen
   * verantwoordelijkheid, geen bijproduct van deduplicatie.
   */
  logged?: boolean;
  status: OutcomeStatus;
  /**
   * Waarom er niets is verstuurd: `no_template`, `channel_inactive`,
   * `operations_failed`, of `idempotency_store_unavailable` bij `blocked`.
   */
  reason?: string;
  error?: string;
};

export type DispatchResult = {
  outcomes: DispatchOutcome[];
  /** Ten minste één bericht is aangekomen of stond er al, en niets faalde. */
  delivered: boolean;
};

const AUDIENCES: readonly Audience[] = ["customer", "operations"];

/** Injecteerbaar zodat kanaal- en volgordepolicy los van de templates testbaar zijn. */
export type TemplateRenderer = (
  event: CommunicationEvent,
  audience: Audience,
  now: Date
) => RenderedMessage | null;

async function dispatchOne(
  event: CommunicationEvent,
  audience: Audience,
  channel: ChannelId,
  log: DeliveryLog,
  now: Date,
  render: TemplateRenderer
): Promise<DispatchOutcome> {
  const rendered = render(event, audience, now);
  if (!rendered) {
    // Nog geen bericht voor dit moment in de lifecycle. Bewust geen logregel:
    // er is geen ontvanger en dus ook geen aflevering om te meten.
    return { audience, channel, templateId: null, status: "skipped", reason: "no_template" };
  }

  const locale = resolveLocale(audience, event.locale);
  const key = dedupKey({ eventType: event.type, subjectId: event.subjectId, audience, channel });

  // Vangrail vóór alles: buiten productie mag alleen naar een expliciete
  // allowlist worden verstuurd. Deze check staat bewust vóór de claim, zodat een
  // geweigerd bericht geen dedup-sleutel verbruikt en een latere legitieme
  // verzending met dezelfde sleutel gewoon door kan.
  const recipients = checkRecipients(rendered.to);
  if (!recipients.allowed) {
    operationalAlert(
      "recipient_blocked",
      `${key}: verzending geweigerd (${recipients.reason}) — ${recipients.blocked.length} ontvanger(s) buiten de allowlist.`
    );
    return {
      audience,
      channel,
      templateId: rendered.templateId,
      status: "blocked",
      reason: `recipient_${recipients.reason}`,
    };
  }

  const claim = await log.claim({
    dedupKey: key,
    eventType: event.type,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    bookingId: event.bookingId,
    templateId: rendered.templateId,
    audience,
    channel,
    locale,
    recipient: rendered.to,
  });

  if (claim.outcome === "duplicate") {
    // Een eerdere poging heeft dit bericht al opgepakt. Niet opnieuw versturen.
    return { audience, channel, templateId: rendered.templateId, status: "duplicate" };
  }

  if (claim.outcome === "unavailable" && duplicatesArePossible(event.type)) {
    // De store hoort te bestaan maar antwoordt niet. Doorgaan zou betekenen dat
    // juist tijdens een databasestoring dubbele klantcommunicatie ontstaat.
    operationalAlert(
      "delivery_blocked",
      `${key}: verzending geblokkeerd omdat de idempotency-store onbereikbaar is (${claim.reason}).`
    );
    return {
      audience,
      channel,
      templateId: rendered.templateId,
      status: "blocked",
      reason: "idempotency_store_unavailable",
    };
  }

  // `claimed` levert een id om op af te ronden. In de overige gevallen gaat het
  // bericht door zónder claim — dan verzorgt `record()` de vastlegging achteraf.
  const deliveryId = claim.outcome === "claimed" ? claim.id : null;
  const claimInput: ClaimInput = {
    dedupKey: key,
    eventType: event.type,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    bookingId: event.bookingId,
    templateId: rendered.templateId,
    audience,
    channel,
    locale,
    recipient: rendered.to,
  };

  /** Rondt af via de claim, of legt achteraf alsnog vast. Geeft terug of dat lukte. */
  const persist = async (status: string, extra?: SettleInput): Promise<boolean> => {
    if (deliveryId) {
      await log.settle(deliveryId, status, extra);
      return true;
    }
    const recorded = await log.record(claimInput, status, extra);
    if (!recorded) {
      operationalAlert(
        "delivery_unlogged",
        `${key}: verstuurd maar niet vastgelegd — deze aflevering is onzichtbaar in het log.`
      );
    }
    return recorded;
  };

  const transport = channelFor(channel);
  if (!transport || !isChannelActive(channel)) {
    const logged = await persist("skipped", { skipReason: "channel_inactive" });
    return {
      audience,
      channel,
      templateId: rendered.templateId,
      status: "skipped",
      reason: "channel_inactive",
      logged,
    };
  }

  const result = await transport.send({
    to: rendered.to,
    replyTo: rendered.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: rendered.attachments,
    idempotencyKey: key,
  });

  if (!result.ok) {
    const logged = await persist("failed", { provider: result.provider, error: result.error });
    return {
      audience,
      channel,
      templateId: rendered.templateId,
      status: "failed",
      error: result.error,
      logged,
    };
  }

  const logged = await persist("sent", {
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  });
  return { audience, channel, templateId: rendered.templateId, status: "sent", logged };
}

/**
 * Verwerkt één domeinevent. Ontvangergroepen worden parallel bediend; binnen een
 * groep gaan de kanalen op volgorde van voorkeur, elk met een eigen logregel.
 */
export async function dispatch(
  event: CommunicationEvent,
  options: { log?: DeliveryLog; now?: Date; render?: TemplateRenderer } = {}
): Promise<DispatchResult> {
  const log = options.log ?? unloggedDeliveryLog;
  const now = options.now ?? new Date();
  const render = options.render ?? renderTemplate;

  const plan = AUDIENCES.map((audience) => ({
    audience,
    channels: channelsFor(event.type, audience),
  }));
  const run = (audience: Audience, channels: readonly ChannelId[]) =>
    Promise.all(channels.map((channel) => dispatchOne(event, audience, channel, log, now, render)));

  let outcomes: DispatchOutcome[];
  if (operationsGatesCustomer(event.type)) {
    // Eerst intern registreren, pas daarna de klant iets beloven.
    const operations = plan.find((entry) => entry.audience === "operations");
    const customer = plan.find((entry) => entry.audience === "customer");
    const opsOutcomes = operations ? await run("operations", operations.channels) : [];
    const opsFailed = opsOutcomes.some(
      (outcome) => outcome.status === "failed" || outcome.status === "blocked"
    );
    const customerOutcomes =
      customer && !opsFailed
        ? await run("customer", customer.channels)
        : (customer?.channels ?? []).map<DispatchOutcome>((channel) => ({
            audience: "customer",
            channel,
            templateId: null,
            status: "skipped",
            reason: "operations_failed",
          }));
    outcomes = [...opsOutcomes, ...customerOutcomes];
  } else {
    const grouped = await Promise.all(plan.map((entry) => run(entry.audience, entry.channels)));
    outcomes = grouped.flat();
  }

  const failed = outcomes.some(
    (outcome) => outcome.status === "failed" || outcome.status === "blocked"
  );
  const landed = outcomes.some(
    (outcome) => outcome.status === "sent" || outcome.status === "duplicate"
  );
  return { outcomes, delivered: !failed && landed };
}
